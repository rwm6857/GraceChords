// Render a song to PDF (always) and JPG (best-effort). The pure PDF engine
// from src/utils/pdf_mvp/pure.js is imported directly across the monorepo;
// wrangler bundles it. Fonts fall back to jsPDF's built-in Helvetica/Courier
// because Noto TTFs (~3.3 MB total) would bust the free-tier 3 MiB worker
// budget — chord charts remain legible. See plan for the trade-off note.
//
// PDF→JPG path uses @hyzyla/pdfium for the WASM rasteriser plus a small PNG
// encoder. Telegram accepts PNG via sendPhoto, so we encode to PNG (no JPG
// encoder needed). If the WASM rasteriser fails to initialise the caller
// gets `null` back and should send the PDF via sendDocument instead.

import { renderSingleSongPdfBuffer, renderMultiSongPdfBuffer } from '../../../src/utils/pdf_mvp/pure.js'
import { makeFontRegistrar } from './fontsWorker.js'
// Bundle the pdfium WASM at deploy time. Workers block
// WebAssembly.instantiate(buffer); only pre-compiled WebAssembly.Module
// instances are allowed, which is what wrangler's bundler produces from a
// .wasm import. The subpath is exposed by @hyzyla/pdfium's package.json
// exports map.
import pdfiumWasmModule from '@hyzyla/pdfium/pdfium.wasm'

let _fontRegistrar = null
function fontRegistrar(env) {
  if (!_fontRegistrar) _fontRegistrar = makeFontRegistrar(env)
  return _fontRegistrar
}

// jsPDF references `window` in a couple of optional code paths. Provide a
// minimal shim before any pdf_mvp call. Safe in browsers (already exists).
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

// Build a song shape the pdf_mvp engine accepts. The pure engine reads
// `lyricsBlocks` or `sections` plus `title` and `key`/`originalKey`.
// Transposition is the caller's responsibility (the engine renders chord
// symbols verbatim) — the site does it in SongViewPage; we do it here.
async function toRenderableSong(song, key) {
  const [{ parseChordProOrLegacy }, { stepsBetween, transposeSymPrefer }] = await Promise.all([
    import('../../../src/utils/chordpro/parser.ts'),
    import('../../../src/utils/chordpro/index.js'),
  ])
  const parsed = parseChordProOrLegacy(song.chordpro_content || '')
  const originalKey = song.default_key || parsed.meta?.key || ''
  const targetKey = key || originalKey
  const steps = (originalKey && targetKey) ? stepsBetween(originalKey, targetKey) : 0
  const preferFlat = /b/.test(String(targetKey))

  const sections = steps === 0 ? parsed.sections : parsed.sections.map(sec => ({
    ...sec,
    instrumental: sec.instrumental
      ? { ...sec.instrumental, chords: sec.instrumental.chords.map(s => transposeSymPrefer(s, steps, preferFlat)) }
      : undefined,
    lines: sec.lines.map(ln => ({
      ...ln,
      chords: ln.chords.map(c => ({ ...c, sym: transposeSymPrefer(c.sym, steps, preferFlat) })),
      instrumental: ln.instrumental
        ? { ...ln.instrumental, chords: ln.instrumental.chords.map(s => transposeSymPrefer(s, steps, preferFlat)) }
        : undefined,
    })),
  }))

  return {
    title: song.title,
    key: targetKey,
    originalKey,
    sections,
  }
}

export async function renderSongPdf(env, song, key) {
  const renderable = await toRenderableSong(song, key)
  return renderSingleSongPdfBuffer(renderable, { registerFonts: fontRegistrar(env) })
}

export async function renderSetlistPdf(env, songs, keys = []) {
  const renderables = []
  for (let i = 0; i < songs.length; i++) {
    renderables.push(await toRenderableSong(songs[i], keys[i]))
  }
  return renderMultiSongPdfBuffer(renderables, { registerFonts: fontRegistrar(env) })
}

// ---- JPG (best-effort) -----------------------------------------------------

let _pdfiumLib = null

async function getPdfium() {
  if (_pdfiumLib) return _pdfiumLib
  try {
    // instantiateWasm is Emscripten's hook for caller-controlled
    // instantiation. We use it to feed the bundled WebAssembly.Module
    // directly to pdfium — Workers allow WebAssembly.instantiate(module,
    // imports) when passed a precompiled Module, but reject the same call
    // when passed a buffer.
    const { PDFiumLibrary } = await import('@hyzyla/pdfium')
    _pdfiumLib = await PDFiumLibrary.init({
      instantiateWasm: (imports, success) => {
        WebAssembly.instantiate(pdfiumWasmModule, imports).then(instance => {
          success(instance, pdfiumWasmModule)
        }).catch(err => {
          console.warn('pdfium WebAssembly.instantiate failed:', err?.message || err)
        })
        return {}
      },
    })
    return _pdfiumLib
  } catch (err) {
    console.warn('pdfium init failed; JPG rendering disabled:', err?.message || err, err?.stack || '')
    return null
  }
}

// Encode an RGBA buffer to PNG. Pure-JS encoder using DEFLATE through the
// global CompressionStream API (available in CF Workers, no extra deps).
async function encodePng(width, height, rgba) {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  function chunk(type, data) {
    const len = data.length
    const out = new Uint8Array(8 + len + 4)
    new DataView(out.buffer).setUint32(0, len)
    out[4] = type.charCodeAt(0)
    out[5] = type.charCodeAt(1)
    out[6] = type.charCodeAt(2)
    out[7] = type.charCodeAt(3)
    out.set(data, 8)
    const crcInput = new Uint8Array(4 + len)
    crcInput.set(out.subarray(4, 8), 0)
    crcInput.set(data, 4)
    new DataView(out.buffer).setUint32(8 + len, crc32(crcInput))
    return out
  }

  const IHDR = new Uint8Array(13)
  const dv = new DataView(IHDR.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  IHDR[8] = 8       // bit depth
  IHDR[9] = 6       // color type RGBA
  IHDR[10] = 0      // compression
  IHDR[11] = 0      // filter
  IHDR[12] = 0      // interlace

  // Raw scanlines: filter byte (0) + row pixels
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  // DEFLATE compress
  const compressed = await deflateRaw(raw)

  const parts = [sig, chunk('IHDR', IHDR), chunk('IDAT', compressed), chunk('IEND', new Uint8Array(0))]
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

async function deflateRaw(bytes) {
  // CompressionStream produces 'deflate' (zlib wrapper). PNG requires raw
  // DEFLATE with a zlib header — 'deflate' format includes the zlib header
  // and Adler-32 trailer, exactly what PNG wants.
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  writer.write(bytes).catch(() => {})
  writer.close().catch(() => {})
  const reader = cs.readable.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Returns Uint8Array (PNG bytes) or null if rasterisation isn't available.
export async function renderSongJpg(env, song, key, { scale = 2 } = {}) {
  const lib = await getPdfium()
  if (!lib) return null

  const pdfBuf = await renderSongPdf(env, song, key)
  let document
  try {
    document = await lib.loadDocument(pdfBuf)
  } catch (err) {
    console.warn('pdfium loadDocument failed:', err?.message || err)
    return null
  }

  try {
    const page = document.getPage(0)
    const out = await page.render({
      scale,
      // Custom renderer receives raw RGBA pixels — encode them ourselves so
      // we don't pull in a JPG/PNG WASM encoder.
      render: async ({ data, width, height }) => {
        return await encodePng(width, height, data)
      },
    })
    // Some pdfium versions return { data: Uint8Array } from the renderer
    const png = out?.image instanceof Uint8Array ? out.image
              : out?.data  instanceof Uint8Array ? out.data
              : out instanceof Uint8Array ? out
              : null
    return png
  } catch (err) {
    console.warn('pdfium render failed:', err?.message || err)
    return null
  } finally {
    try { document.destroy?.() } catch {}
  }
}
