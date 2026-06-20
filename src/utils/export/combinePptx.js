/*
 * Setlist PPTX export.
 *
 * Earlier versions merged each song deck's slides *with* their original
 * slideMasters / slideLayouts / themes into one ZIP. Because the source decks
 * are hand-made and never byte-identical, that produced mismatched master
 * references and subtly invalid OOXML — the cause of both the "PowerPoint found
 * a problem… Repair?" prompt and the inconsistent formatting between songs.
 *
 * This implementation instead reads only the *text* out of every source slide
 * (in true presentation order) and rebuilds a brand-new, single-master deck
 * with pptxgenjs. The output is therefore valid by construction (no repair
 * prompt) and uniformly formatted: black 16:9 background, one shared
 * master/theme, and 54pt white centered Calibri anchored in the upper third.
 *
 * Blank source slides (the single separator slide each song deck carries
 * between songs) carry no text, so they become blank black slides — preserving
 * the separators without us adding or removing any.
 */

// 16:9 widescreen, in inches (13.333 x 7.5).
const SLIDE_W = 13.333
const SLIDE_H = 7.5
const LAYOUT_NAME = 'GC_16x9'
const MASTER_NAME = 'GC_BLACK'
const BG_COLOR = '000000'

// One standardized, bold, centred text box per slide. It spans the slide edge
// to edge and is anchored to its centre (valign 'middle') in the upper third.
const TEXT_BOX = {
  x: 0,
  y: 0.5,
  w: SLIDE_W,
  h: 3.2,
  align: 'center',
  valign: 'middle',
  fontFace: 'Calibri',
  bold: true,
  color: 'FFFFFF',
  fit: 'none',
  wrap: true,
  margin: 0,
}

const MAX_FONT = 52
const MIN_FONT = 40
// Keep a little breathing room from the literal edges when sizing text.
const FIT_WIDTH_IN = SLIDE_W - 0.4
const LINE_HEIGHT = 1.2

// PowerPoint's own "shrink text on overflow" only applies a baked-in fontScale,
// which we can't compute, so it does nothing on open. Instead we size each
// slide's text ourselves: the largest size (<= MAX_FONT) at which every line
// still fits on one line within the box, and the whole block fits its height.
// Measured with a canvas; when unavailable (SSR/tests) we fall back to the
// height-only bound. Explicit line breaks (one per source paragraph) are kept.
let measureCtx
function getMeasureCtx() {
  if (measureCtx !== undefined) return measureCtx
  try {
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext ? canvas.getContext('2d') : null
  } catch {
    measureCtx = null
  }
  return measureCtx
}

export function fitFontSize(lines) {
  let size = MAX_FONT
  const ctx = getMeasureCtx()
  if (ctx) {
    for (const line of lines) {
      ctx.font = 'bold 100px Calibri, Arial, sans-serif'
      const widthAt100 = ctx.measureText(line).width
      if (widthAt100 > 0) {
        size = Math.min(size, (FIT_WIDTH_IN * 72 * 100) / widthAt100)
      }
    }
  }
  const maxForHeight = (TEXT_BOX.h * 72) / (Math.max(lines.length, 1) * LINE_HEIGHT)
  size = Math.min(size, maxForHeight)
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(size)))
}

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'

const parser = new DOMParser()

function sanitizeFilename(input) {
  const fallback = 'setlist'
  if (!input) return fallback
  const trimmed = String(input).trim()
  if (!trimmed) return fallback
  const safe = trimmed
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return safe || fallback
}

function parseXml(xml) {
  const doc = parser.parseFromString(xml, 'application/xml')
  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) throw new Error(parseError.textContent || 'Failed to parse XML')
  return doc
}

function getNumericSuffix(value) {
  const match = String(value || '').match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

// Namespace-aware element select that works in both real browsers and the
// happy-dom test environment (whose getElementsByTagNameNS is unreliable),
// matching on localName + namespaceURI in document order.
function selectNS(root, ns, local) {
  const out = []
  const all = root.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    if (el.localName === local && el.namespaceURI === ns) out.push(el)
  }
  return out
}

// Resolve a relationship Target (declared relative to ppt/presentation.xml)
// to a full path inside the ZIP.
function resolveSlideTarget(target) {
  if (!target) return null
  if (target.startsWith('/')) return target.slice(1)
  return `ppt/${target.replace(/^\.\//, '')}`
}

// Return slide part paths in true presentation order (from presentation.xml's
// sldIdLst → relationship targets), falling back to a numeric filename sort.
//
// Parsed via regex on the raw XML rather than the DOM: the relationship id on
// <p:sldId> is a namespace-prefixed attribute (r:id), and not every XML parser
// (happy-dom included) preserves prefixed attributes reliably.
async function getOrderedSlidePaths(zip) {
  const presEntry = zip.file('ppt/presentation.xml')
  const relsEntry = zip.file('ppt/_rels/presentation.xml.rels')
  if (presEntry && relsEntry) {
    try {
      const presXml = await presEntry.async('string')
      const relsXml = await relsEntry.async('string')

      // Ordered relationship ids referenced by <p:sldId r:id="…"> (any prefix).
      const order = []
      const sldIdRe = /<[\w]*:?sldId\b[^>]*?\b[A-Za-z][\w-]*:id="([^"]+)"/g
      let m
      while ((m = sldIdRe.exec(presXml))) order.push(m[1])

      // Map relationship id → target for slide relationships.
      const relMap = new Map()
      const relRe = /<Relationship\b[^>]*\/?>/g
      let r
      while ((r = relRe.exec(relsXml))) {
        const tag = r[0]
        const id = (tag.match(/\bId="([^"]+)"/) || [])[1]
        const type = (tag.match(/\bType="([^"]+)"/) || [])[1] || ''
        const target = (tag.match(/\bTarget="([^"]+)"/) || [])[1]
        if (id && target && type.endsWith('/slide')) relMap.set(id, target)
      }

      const seen = new Set()
      const paths = []
      for (const rid of order) {
        if (seen.has(rid)) continue
        seen.add(rid)
        const resolved = resolveSlideTarget(relMap.get(rid))
        if (resolved && zip.file(resolved)) paths.push(resolved)
      }
      if (paths.length) return paths
    } catch {
      /* fall through to filename sort */
    }
  }

  return zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => getNumericSuffix(a.name) - getNumericSuffix(b.name))
    .map((f) => f.name)
}

// Pull the visible lines from one slide's XML: each <a:p> paragraph becomes one
// line (its <a:t> runs concatenated). Empty paragraphs are dropped.
export function extractLinesFromSlideXml(xml) {
  let doc
  try {
    doc = parseXml(xml)
  } catch {
    return []
  }
  const paragraphs = selectNS(doc, A_NS, 'p')
  const lines = []
  for (const p of paragraphs) {
    const runs = selectNS(p, A_NS, 't')
    const line = runs.map((t) => t.textContent || '').join('').replace(/\s+/g, ' ').trim()
    if (line) lines.push(line)
  }
  return lines
}

// Extract every slide of one source deck as { lines } in presentation order.
export async function extractDeckSlides(zip) {
  const paths = await getOrderedSlidePaths(zip)
  const slides = []
  for (const path of paths) {
    const entry = zip.file(path)
    if (!entry) continue
    const xml = await entry.async('string')
    slides.push({ lines: extractLinesFromSlideXml(xml) })
  }
  return slides
}

// Build a clean, standardized presentation from extracted slides.
export async function buildPresentation(slides = []) {
  const mod = await import('pptxgenjs')
  const PptxGenJS = mod.default || mod
  const pptx = new PptxGenJS()

  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_W, height: SLIDE_H })
  pptx.layout = LAYOUT_NAME
  pptx.defineSlideMaster({ title: MASTER_NAME, background: { color: BG_COLOR } })

  for (const s of slides) {
    const slide = pptx.addSlide({ masterName: MASTER_NAME })
    slide.background = { color: BG_COLOR }
    const lines = s && Array.isArray(s.lines) ? s.lines : []
    if (lines.length) {
      slide.addText(lines.join('\n'), { ...TEXT_BOX, fontSize: fitFontSize(lines) })
    }
  }
  return pptx
}

export async function combinePptxFiles(songFileUrls = [], setlistName = 'Setlist') {
  if (!Array.isArray(songFileUrls) || songFileUrls.length === 0) {
    throw new Error('No PPTX files to merge')
  }
  const JSZip = (await import('jszip')).default

  // Fetch all decks in parallel; preserve order and silently skip any that
  // fail (404 / network error) so missing songs don't abort the export.
  const results = await Promise.all(
    songFileUrls.map((url) =>
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .catch(() => null)
    )
  )
  const buffers = results.filter(Boolean)
  if (!buffers.length) throw new Error('No PPTX files could be loaded')

  const slides = []
  for (const buffer of buffers) {
    try {
      const zip = await JSZip.loadAsync(buffer)
      const deck = await extractDeckSlides(zip)
      slides.push(...deck)
    } catch {
      /* skip a deck we can't read rather than failing the whole export */
    }
  }
  if (!slides.length) throw new Error('No slides could be extracted from the PPTX files')

  const pptx = await buildPresentation(slides)
  const safeName = sanitizeFilename(setlistName || 'Setlist')
  await pptx.writeFile({ fileName: `${safeName}_worship.pptx` })
}
