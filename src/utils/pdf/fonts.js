// src/utils/pdf/fonts.js

// Small in-memory cache of fetched font data
let fontDataPromise = null

async function loadFontData() {
  if (fontDataPromise) return fontDataPromise
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/') + 'fonts/'
  const files = [
    'NotoSans-Regular.ttf',
    'NotoSans-Bold.ttf',
    'NotoSans-Italic.ttf',
    'NotoSans-BoldItalic.ttf',
    'NotoSansMono-Regular.ttf',
    'NotoSansMono-Bold.ttf'
  ]
  fontDataPromise = Promise.all(files.map(f => fetchAsBase64(base + f))).then(b64s => {
    const map = {}
    files.forEach((f, i) => { map[f] = b64s[i] })
    return map
  })
  return fontDataPromise
}

export async function ensureFontsEmbedded(doc) {
  try {
    const fonts = await loadFontData()
    for (const [name, b64] of Object.entries(fonts)) {
      doc.addFileToVFS(name, b64)
    }
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
    doc.addFont('NotoSans-Italic.ttf', 'NotoSans', 'italic')
    doc.addFont('NotoSans-BoldItalic.ttf', 'NotoSans', 'bolditalic')
    doc.addFont('NotoSansMono-Regular.ttf', 'NotoSansMono', 'normal')
    doc.addFont('NotoSansMono-Bold.ttf', 'NotoSansMono', 'bold')
    return { lyricFamily: 'NotoSans', chordFamily: 'NotoSansMono' }
  } catch (e) {
    console.warn('Falling back to core fonts; put Noto files in /public/fonts', e)
    return { lyricFamily: 'Helvetica', chordFamily: 'Courier' }
  }
}

// Load fonts for Canvas2D; reused by the JPG exporter
let canvasFontsPromise = null
export async function ensureCanvasFonts() {
  if (canvasFontsPromise) return canvasFontsPromise
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
  const specs = [
    { family: 'NotoSans', weight: '400', style: 'normal', file: 'NotoSans-Regular.ttf' },
    { family: 'NotoSans', weight: '700', style: 'normal', file: 'NotoSans-Bold.ttf' },
    { family: 'NotoSans', weight: '400', style: 'italic', file: 'NotoSans-Italic.ttf' },
    { family: 'NotoSans', weight: '700', style: 'italic', file: 'NotoSans-BoldItalic.ttf' },
    { family: 'NotoSansMono', weight: '400', style: 'normal', file: 'NotoSansMono-Regular.ttf' },
    { family: 'NotoSansMono', weight: '700', style: 'normal', file: 'NotoSansMono-Bold.ttf' }
  ]
  canvasFontsPromise = Promise.all(specs.map(async (s) => {
    const face = new FontFace(s.family, `url(${base}fonts/${s.file})`, { weight: s.weight, style: s.style })
    const loaded = await face.load()
    document.fonts.add(loaded)
  })).then(() => ({ lyricFamily: 'NotoSans', chordFamily: 'NotoSansMono' }))
    .catch(() => ({ lyricFamily: 'Helvetica', chordFamily: 'Courier' }))
  return canvasFontsPromise
}

async function fetchAsBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Font fetch ' + url)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

