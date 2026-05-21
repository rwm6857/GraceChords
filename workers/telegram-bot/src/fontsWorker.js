// Loads Noto TTFs from R2 (under fonts/) and registers them into a jsPDF
// instance. Fonts live in module scope so the second PDF render in the same
// worker isolate is instant — R2 is only hit on cold start. If R2 is
// unreachable (e.g. bucket misconfigured) we resolve with null fonts so the
// renderer transparently falls back to jsPDF's built-in Helvetica/Courier.

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
          console.warn(`[fontsWorker] addFont failed for ${family}:${style}:`, err?.message || err)
        }
      }
    } catch (err) {
      // Reset cache so a transient R2 failure doesn't poison subsequent
      // requests in the same isolate.
      _cachedFontsPromise = null
      console.warn('[fontsWorker] R2 font load failed; falling back to Helvetica:', err?.message || err)
    }
  }
}
