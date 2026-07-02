// Loads Noto TTFs from R2 (under fonts/) and registers them into a jsPDF
// instance so server-rendered PDFs use the same Noto Sans / Noto Sans Mono
// the browser build embeds — rather than jsPDF's built-in Helvetica/Courier.
// Fonts are fetched at runtime (never bundled) so they don't count against the
// Workers/Pages script-size limit, and are cached in module scope so only the
// cold render in an isolate hits R2. If R2 is unreachable or the binding is
// absent, this resolves without registering fonts and the renderer falls back
// to Helvetica/Courier.
//
// Mirrors workers/telegram-bot/src/fontsWorker.js; both the Telegram worker and
// the /api/export/song Pages Function need this and don't share a bundle.
// Deduping the worker onto this module is a follow-up (see serverSong.js /
// pngRaster.js).

const FONT_PREFIX = 'fonts/'

const MANIFEST = [
  { file: 'NotoSans-Regular.ttf',     family: 'NotoSans',     style: 'normal' },
  { file: 'NotoSans-Bold.ttf',        family: 'NotoSans',     style: 'bold' },
  { file: 'NotoSans-Italic.ttf',      family: 'NotoSans',     style: 'italic' },
  { file: 'NotoSans-BoldItalic.ttf',  family: 'NotoSans',     style: 'bolditalic' },
  { file: 'NotoSansMono-Regular.ttf', family: 'NotoSansMono', style: 'normal' },
  { file: 'NotoSansMono-Bold.ttf',    family: 'NotoSansMono', style: 'bold' },
]

let _cachedFontsPromise = null

function bytesToBase64(bytes) {
  // btoa expects a binary string; chunk to avoid blowing the call stack on
  // multi-hundred-KB arrays.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function fetchFontBase64(env, file) {
  const obj = await env.R2_BUCKET.get(`${FONT_PREFIX}${file}`)
  if (!obj) {
    throw new Error(`Font missing from R2: ${FONT_PREFIX}${file}`)
  }
  const buf = await obj.arrayBuffer()
  return bytesToBase64(new Uint8Array(buf))
}

async function loadFonts(env) {
  if (!env?.R2_BUCKET) {
    throw new Error('R2_BUCKET binding not configured')
  }
  const entries = await Promise.all(
    MANIFEST.map(async (m) => ({
      ...m,
      base64: await fetchFontBase64(env, m.file),
    })),
  )
  return entries
}

// Returns a `registerFonts(doc)` callback shaped for pure.js. Falls back to
// the jsPDF built-in fonts if R2 reads fail.
export function makeFontRegistrar(env) {
  return async function registerFonts(doc) {
    try {
      if (!_cachedFontsPromise) _cachedFontsPromise = loadFonts(env)
      const fonts = await _cachedFontsPromise
      for (const { file, family, style, base64 } of fonts) {
        try {
          doc.addFileToVFS(file, base64)
          doc.addFont(file, family, style)
        } catch (err) {
          console.warn(`[fontsR2] addFont failed for ${family}:${style}:`, err?.message || err)
        }
      }
    } catch (err) {
      // Reset cache so a transient R2 failure doesn't poison subsequent
      // requests in the same isolate.
      _cachedFontsPromise = null
      console.warn('[fontsR2] R2 font load failed; falling back to Helvetica:', err?.message || err)
    }
  }
}
