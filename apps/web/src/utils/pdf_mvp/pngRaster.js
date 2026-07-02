// PDF page-1 → PNG rasterisation via @hyzyla/pdfium (WASM) plus a small
// pure-JS PNG encoder (DEFLATE through the global CompressionStream API —
// available in CF Workers/Pages Functions, no extra deps). Extracted from
// workers/telegram-bot/src/pdfRender.js so the export Pages Function can
// share it; the worker still carries its own copy until it is refactored
// onto this module (follow-up).
//
// The `.wasm` import stays in each entry point: Workers/Pages block
// WebAssembly.instantiate(buffer) and only allow pre-compiled
// WebAssembly.Module instances (which wrangler's bundler produces from a
// .wasm import), so callers pass that module in here.

let _pdfiumLib = null
// On init failure, suppress retries for a bounded window so a transient
// breakage doesn't cause every request to re-attempt instantiation. After
// the window the next request retries, so a fix (or fresh deploy with a
// fresh isolate) recovers automatically.
let _pdfiumFailedUntil = 0
const PDFIUM_FAILURE_TTL_MS = 60_000

async function getPdfium(wasmModule) {
  if (_pdfiumLib) return _pdfiumLib
  if (Date.now() < _pdfiumFailedUntil) return null
  try {
    // instantiateWasm is Emscripten's hook for caller-controlled
    // instantiation — feed the bundled WebAssembly.Module directly to pdfium.
    const { PDFiumLibrary } = await import('@hyzyla/pdfium')
    _pdfiumLib = await PDFiumLibrary.init({
      instantiateWasm: (imports, success) => {
        WebAssembly.instantiate(wasmModule, imports).then(instance => {
          success(instance, wasmModule)
        }).catch(err => {
          console.warn('pdfium WebAssembly.instantiate failed:', err?.message || err)
        })
        return {}
      },
    })
    return _pdfiumLib
  } catch (err) {
    _pdfiumFailedUntil = Date.now() + PDFIUM_FAILURE_TTL_MS
    console.warn('pdfium init failed; image rendering disabled:', err?.message || err, err?.stack || '')
    return null
  }
}

// Encode an RGBA buffer to PNG.
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
  // CompressionStream 'deflate' includes the zlib header and Adler-32
  // trailer, exactly what PNG's IDAT wants.
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

// Rasterise page 1 of a PDF buffer to PNG bytes. Returns Uint8Array or null
// if the WASM rasteriser isn't available or fails — callers should fall back
// to serving the PDF.
export async function rasterizePdfToPng(pdfBuf, wasmModule, { scale = 2 } = {}) {
  const lib = await getPdfium(wasmModule)
  if (!lib) return null

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
