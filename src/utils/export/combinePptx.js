/*
 * Setlist PPTX export.
 *
 * Earlier versions merged each song deck's slides *with* their original
 * slideMasters / slideLayouts / themes into one ZIP. Because the source decks
 * are hand-made and never byte-identical, that produced mismatched master
 * references and subtly invalid OOXML — the cause of both the "PowerPoint found
 * a problem… Repair?" prompt and the inconsistent formatting between songs.
 *
 * This implementation instead reads the lyric *text* out of every source slide
 * (in true presentation order) and rebuilds a brand-new, single-master deck
 * with pptxgenjs. The output is valid by construction (no repair prompt) and
 * uniformly formatted: black 16:9 background, one shared master/theme, and bold
 * white centred Calibri anchored in the upper third.
 *
 * What it does with the messy bits of hand-made decks:
 *   • Lyrics come only from top-level text shapes whose effective colour is
 *     visible. Relic text that was "hidden" by colouring it black (invisible on
 *     the black background) resolves to black and is dropped.
 *   • Country flags (a grouped picture + label in the corner) are preserved
 *     verbatim: their original shape XML is injected back into the rebuilt slide
 *     and their image media copied across.
 *   • Blank source slides carry no text → blank black separator slides.
 */

// 16:9 widescreen, in inches (13.333 x 7.5).
const SLIDE_W = 13.333
const SLIDE_H = 7.5
const LAYOUT_NAME = 'GC_16x9'
const MASTER_NAME = 'GC_BLACK'
const BG_COLOR = '000000'
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'

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

const MAX_FONT = 50
const MIN_FONT = 46
// Text may run essentially to the slide edge, so only a hair of margin.
const FIT_WIDTH_IN = SLIDE_W - 0.1
const LINE_HEIGHT = 1.2
// Calibri renders noticeably narrower than the fonts a browser falls back to
// when it isn't installed (typically Arial). When we have to measure with a
// fallback, scale the measured width by this factor so we don't over-shrink.
const FALLBACK_WIDTH_RATIO = 0.88

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const parser = new DOMParser()

const PRESET_COLORS = { white: 'FFFFFF', black: '000000', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00' }
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/x-emf', wmf: 'image/x-wmf', tiff: 'image/tiff' }

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

async function readText(zip, path) {
  const file = zip.file(path)
  return file ? file.async('string') : ''
}

function relsPathForPart(partPath) {
  const i = partPath.lastIndexOf('/')
  return `${partPath.slice(0, i)}/_rels/${partPath.slice(i + 1)}.rels`
}

// Resolve a relationship Target (relative to the owning part) to a full ZIP path.
function resolvePartPath(ownerPart, target) {
  if (!target) return ''
  if (target.startsWith('/')) return target.slice(1)
  const parts = ownerPart.split('/')
  parts.pop()
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function parseRelsMap(relsXml) {
  const map = new Map()
  const re = /<Relationship\b[^>]*\/?>/g
  let m
  while ((m = re.exec(relsXml))) {
    const tag = m[0]
    const id = (tag.match(/\bId="([^"]+)"/) || [])[1]
    const type = (tag.match(/\bType="([^"]+)"/) || [])[1] || ''
    const target = (tag.match(/\bTarget="([^"]+)"/) || [])[1] || ''
    if (id) map.set(id, { type, target })
  }
  return map
}

function resolveSlideTargetToPath(target) {
  if (!target) return null
  if (target.startsWith('/')) return target.slice(1)
  return `ppt/${target.replace(/^\.\//, '')}`
}

// Return slide part paths in true presentation order (from presentation.xml's
// sldIdLst → relationship targets), falling back to a numeric filename sort.
// Parsed via regex because the relationship id on <p:sldId> is a namespaced
// attribute (r:id) that not every XML parser preserves.
async function getOrderedSlidePaths(zip) {
  const presEntry = zip.file('ppt/presentation.xml')
  const relsEntry = zip.file('ppt/_rels/presentation.xml.rels')
  if (presEntry && relsEntry) {
    try {
      const presXml = await presEntry.async('string')
      const relsXml = await relsEntry.async('string')

      const order = []
      const sldIdRe = /<[\w]*:?sldId\b[^>]*?\b[A-Za-z][\w-]*:id="([^"]+)"/g
      let m
      while ((m = sldIdRe.exec(presXml))) order.push(m[1])

      const relMap = parseRelsMap(relsXml)
      const seen = new Set()
      const paths = []
      for (const rid of order) {
        if (seen.has(rid)) continue
        seen.add(rid)
        const rel = relMap.get(rid)
        if (!rel || !rel.type.endsWith('/slide')) continue
        const resolved = resolveSlideTargetToPath(rel.target)
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

// Scan a slide/layout's spTree and return its direct-child elements as
// { tag, xml } in document order, preserving the original XML verbatim (so
// namespaced attributes like r:embed survive — DOMParser would drop them).
function scanTopLevelShapes(xml) {
  const open = xml.indexOf('<p:spTree')
  if (open < 0) return []
  const treeStart = xml.indexOf('>', open) + 1
  const treeEnd = xml.indexOf('</p:spTree>', treeStart)
  if (treeEnd < 0) return []
  const region = xml.slice(treeStart, treeEnd)

  const shapes = []
  const tagRe = /<(\/?)([\w.-]+:[\w.-]+)((?:"[^"]*"|'[^']*'|[^>])*)>/g
  let depth = 0
  let curStart = -1
  let curTag = null
  let m
  while ((m = tagRe.exec(region))) {
    const closing = m[1] === '/'
    const name = m[2]
    const selfClose = /\/\s*$/.test(m[3])
    if (closing) {
      depth -= 1
      if (depth === 0 && curTag === name) {
        shapes.push({ tag: curTag, xml: region.slice(curStart, tagRe.lastIndex) })
        curStart = -1
        curTag = null
      }
    } else if (selfClose) {
      if (depth === 0) shapes.push({ tag: name, xml: m[0] })
    } else {
      if (depth === 0) {
        curStart = m.index
        curTag = name
      }
      depth += 1
    }
  }
  return shapes
}

// --- Effective text colour resolution -------------------------------------
// Hand-made decks "hide" relic text by colouring it black (invisible on the
// black background). We resolve a shape's effective colour through the OOXML
// inheritance chain and drop anything that lands on (near) black.

function fillToHex(fillXml, ctx) {
  if (!fillXml) return null
  let m = fillXml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)
  if (m) return m[1].toUpperCase()
  m = fillXml.match(/<a:sysClr val="(\w+)"(?:[^>]*lastClr="([0-9A-Fa-f]{6})")?/)
  if (m) return m[2] ? m[2].toUpperCase() : m[1] === 'window' ? 'FFFFFF' : '000000'
  m = fillXml.match(/<a:prstClr val="(\w+)"/)
  if (m) return PRESET_COLORS[m[1]] || null
  m = fillXml.match(/<a:schemeClr val="(\w+)"/)
  if (m && ctx) {
    const themeName = ctx.clrMap[m[1]] || m[1]
    return ctx.themeMap[themeName] || null
  }
  return null
}

function firstSolidFill(segment) {
  const m = segment ? segment.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/) : null
  return m ? m[0] : null
}

function parsePlaceholder(spXml) {
  const m = spXml.match(/<p:ph\b([^>]*?)\/?>/)
  if (!m) return null
  const attrs = m[1]
  const type = (attrs.match(/type="([^"]+)"/) || [])[1] || 'body'
  const idx = (attrs.match(/idx="([^"]+)"/) || [])[1]
  return { type, idx: idx == null ? null : idx }
}

function parseLayoutPlaceholderFills(layoutXml) {
  const map = new Map()
  for (const sh of scanTopLevelShapes(layoutXml)) {
    if (sh.tag !== 'p:sp') continue
    const ph = parsePlaceholder(sh.xml)
    if (!ph) continue
    const body = (sh.xml.match(/<p:txBody>[\s\S]*?<\/p:txBody>/) || [''])[0]
    const fill = firstSolidFill(body)
    if (!fill) continue
    if (ph.idx != null) map.set(`idx:${ph.idx}`, fill)
    if (ph.type) map.set(`type:${ph.type}`, fill)
  }
  return map
}

async function buildColorContext(zip) {
  const masterFile = zip.file(/^ppt\/slideMasters\/slideMaster\d+\.xml$/)[0]
  const masterPath = masterFile ? masterFile.name : ''
  const masterXml = masterPath ? await readText(zip, masterPath) : ''

  let themeXml = ''
  if (masterPath) {
    const rels = parseRelsMap(await readText(zip, relsPathForPart(masterPath)))
    for (const [, rel] of rels) {
      if (rel.type.endsWith('/theme')) {
        themeXml = await readText(zip, resolvePartPath(masterPath, rel.target))
        break
      }
    }
  }
  if (!themeXml) themeXml = await readText(zip, 'ppt/theme/theme1.xml')

  const themeMap = {}
  for (const name of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
    const m = themeXml.match(new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`))
    if (m) themeMap[name] = fillToHex(`<a:solidFill>${m[1]}</a:solidFill>`)
  }

  const clrMap = {}
  const cm = masterXml.match(/<p:clrMap\b[^>]*\/>/)
  if (cm) {
    const re = /(\w+)="(\w+)"/g
    let a
    while ((a = re.exec(cm[0]))) clrMap[a[1]] = a[2]
  }

  const txStyle = { title: null, body: null, other: null }
  for (const [key, style] of [['title', 'titleStyle'], ['body', 'bodyStyle'], ['other', 'otherStyle']]) {
    const m = masterXml.match(new RegExp(`<p:${style}>([\\s\\S]*?)</p:${style}>`))
    if (m) txStyle[key] = firstSolidFill(m[1])
  }

  return { zip, themeMap, clrMap, txStyle, layoutCache: new Map() }
}

async function getLayoutFills(ctx, slidePath) {
  const rels = parseRelsMap(await readText(ctx.zip, relsPathForPart(slidePath)))
  let layoutPath = ''
  for (const [, rel] of rels) {
    if (rel.type.endsWith('/slideLayout')) {
      layoutPath = resolvePartPath(slidePath, rel.target)
      break
    }
  }
  if (!layoutPath) return new Map()
  if (ctx.layoutCache.has(layoutPath)) return ctx.layoutCache.get(layoutPath)
  const fills = parseLayoutPlaceholderFills(await readText(ctx.zip, layoutPath))
  ctx.layoutCache.set(layoutPath, fills)
  return fills
}

function effectiveColorHex(spXml, ctx, layoutFills) {
  const body = (spXml.match(/<p:txBody>[\s\S]*?<\/p:txBody>/) || [''])[0]
  let fill = firstSolidFill(body)
  if (!fill) {
    const ph = parsePlaceholder(spXml)
    if (ph) {
      fill = (ph.idx != null && layoutFills.get(`idx:${ph.idx}`)) || layoutFills.get(`type:${ph.type}`) || null
      if (!fill) {
        fill = ph.type === 'title' || ph.type === 'ctrTitle' ? ctx.txStyle.title : ph.type === 'body' ? ctx.txStyle.body : ctx.txStyle.other
      }
    }
  }
  return fill ? fillToHex(fill, ctx) : null
}

// Only treat as hidden when we positively resolve to a near-black colour; an
// unresolved colour stays visible so we never silently drop real lyrics.
function isHiddenColor(hex) {
  if (!hex) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return Math.max(r, g, b) <= 0x20
}

// --- Lyric text extraction -------------------------------------------------

// Each <a:p> paragraph yields one or more lines: <a:t> runs are concatenated,
// soft breaks (<a:br/>), literal newlines, and runs of 2+ spaces (a hand-made
// break convention) each split the paragraph into separate lines.
function paragraphToLines(paragraph) {
  let buffer = ''
  for (const node of Array.from(paragraph.childNodes)) {
    if (node.nodeType !== 1 || node.namespaceURI !== A_NS) continue
    if (node.localName === 'r' || node.localName === 'fld') {
      for (const t of selectNS(node, A_NS, 't')) buffer += t.textContent || ''
    } else if (node.localName === 'br') {
      buffer += '\n'
    }
  }
  return buffer
    .split(/\r?\n|\v|[ \t]{2,}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function linesFromShapeXml(spXml) {
  // Shape fragments don't carry the a:/p:/r: namespace declarations that live
  // on the slide root, so wrap them before parsing. (Prefixes declared inline
  // on the fragment, e.g. a16, come along on their own.)
  const body = spXml.replace(/^\s*<\?xml[^>]*\?>\s*/, '')
  const wrapped = `<gcw xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">${body}</gcw>`
  let doc
  try {
    doc = parseXml(wrapped)
  } catch {
    return []
  }
  const lines = []
  for (const p of selectNS(doc, A_NS, 'p')) lines.push(...paragraphToLines(p))
  return lines
}

// Kept for unit tests: extract every paragraph of a whole slide as lines.
export function extractLinesFromSlideXml(xml) {
  return linesFromShapeXml(xml)
}

async function resolveDecorationImages(decoXml, relsMap, zip, slidePath, deckId) {
  const ids = new Set()
  let m
  const re = /r:(?:embed|link)="([^"]+)"/g
  while ((m = re.exec(decoXml))) ids.add(m[1])
  const images = []
  for (const id of ids) {
    const rel = relsMap.get(id)
    if (!rel || !/\/image$/.test(rel.type)) continue
    const path = resolvePartPath(slidePath, rel.target)
    const file = zip.file(path)
    if (!file) continue
    const data = await file.async('uint8array')
    const ext = ((path.match(/\.(\w+)$/) || [])[1] || 'png').toLowerCase()
    images.push({ oldId: id, data, ext, srcKey: `${deckId}:${path}` })
  }
  return images
}

// Extract one source deck as [{ lines, decorations }] in presentation order.
// `decorations` carry the original shape XML + image bytes so flags/labels can
// be re-injected verbatim into the rebuilt deck.
export async function extractDeckSlides(zip, deckId = 0) {
  const ctx = await buildColorContext(zip)
  const paths = await getOrderedSlidePaths(zip)
  const slides = []
  for (const path of paths) {
    const slideXml = await readText(zip, path)
    if (!slideXml) {
      slides.push({ lines: [], decorations: [] })
      continue
    }
    const layoutFills = await getLayoutFills(ctx, path)
    const relsMap = parseRelsMap(await readText(zip, relsPathForPart(path)))
    const lines = []
    const decorations = []
    const seenDeco = new Set()
    for (const shape of scanTopLevelShapes(slideXml)) {
      if (shape.tag === 'p:sp') {
        if (!isHiddenColor(effectiveColorHex(shape.xml, ctx, layoutFills))) {
          lines.push(...linesFromShapeXml(shape.xml))
        }
      } else if (shape.tag === 'p:grpSp' || shape.tag === 'p:pic') {
        // Dedupe decorations that sit at the same spot (decks often stack
        // duplicate flag groups that differ only in formatting). Key on the
        // decoration's position/size; fall back to the raw XML if absent.
        const off = shape.xml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/)
        const ext = shape.xml.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/)
        const sig = off && ext ? `${off[1]},${off[2]},${ext[1]},${ext[2]}` : shape.xml
        if (seenDeco.has(sig)) continue
        seenDeco.add(sig)
        const images = await resolveDecorationImages(shape.xml, relsMap, zip, path, deckId)
        decorations.push({ xml: shape.xml, images })
      }
    }
    slides.push({ lines, decorations })
  }
  return slides
}

// --- Standardized generation ----------------------------------------------

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

let widthRatio
function getWidthRatio(ctx) {
  if (widthRatio !== undefined) return widthRatio
  widthRatio = 1
  try {
    const probe = 'mmmmmwwwwwiiiii0123456789'
    ctx.font = 'bold 72px monospace'
    const base = ctx.measureText(probe).width
    ctx.font = 'bold 72px Calibri, monospace'
    if (ctx.measureText(probe).width === base) widthRatio = FALLBACK_WIDTH_RATIO
  } catch {
    widthRatio = 1
  }
  return widthRatio
}

// Largest size (within MIN..MAX) at which every line fits the box width on one
// line and the block fits the box height. Canvas-measured; falls back to the
// height bound when canvas metrics are unavailable (SSR/tests).
export function fitFontSize(lines) {
  let size = MAX_FONT
  const ctx = getMeasureCtx()
  if (ctx) {
    const ratio = getWidthRatio(ctx)
    for (const line of lines) {
      ctx.font = 'bold 100px Calibri, Arial, sans-serif'
      const widthAt100 = ctx.measureText(line).width
      if (widthAt100 > 0) size = Math.min(size, (FIT_WIDTH_IN * 72 * 100) / (widthAt100 * ratio))
    }
  }
  const maxForHeight = (TEXT_BOX.h * 72) / (Math.max(lines.length, 1) * LINE_HEIGHT)
  size = Math.min(size, maxForHeight)
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(size)))
}

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

function maxRelId(relsXml) {
  let max = 0
  const re = /Id="rId(\d+)"/g
  let m
  while ((m = re.exec(relsXml))) max = Math.max(max, Number(m[1]))
  return max
}

function appendRelationship(relsXml, id, type, target) {
  const rel = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`
  if (relsXml.includes('</Relationships>')) return relsXml.replace('</Relationships>', `${rel}</Relationships>`)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`
}

function ensureDefaultContentType(ctXml, ext) {
  if (new RegExp(`<Default Extension="${ext}"`, 'i').test(ctXml)) return ctXml
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  return ctXml.replace('</Types>', `<Default Extension="${ext}" ContentType="${mime}"/></Types>`)
}

// Inject preserved decorations (flags/labels) into the rebuilt deck's slides,
// copying their image media and wiring up fresh relationships per slide.
async function injectDecorations(zip, slides) {
  const mediaNames = new Map()
  const neededExt = new Set()
  let mediaCounter = 0

  for (let i = 0; i < slides.length; i++) {
    const decorations = slides[i].decorations
    if (!decorations || !decorations.length) continue
    const n = i + 1
    const slidePath = `ppt/slides/slide${n}.xml`
    const relsPath = `ppt/slides/_rels/slide${n}.xml.rels`
    let slideXml = await readText(zip, slidePath)
    if (!slideXml) continue
    let relsXml = await readText(zip, relsPath)
    let nextId = maxRelId(relsXml)

    let injected = ''
    let nextShapeId = 1000 + i * 100
    for (const deco of decorations) {
      // Renumber shape ids so the injected flag can't collide with the ids
      // pptxgenjs assigned to this slide's own shapes.
      let dxml = deco.xml.replace(/(<p:cNvPr\b[^>]*\bid=")\d+(")/g, (_, a, b) => `${a}${nextShapeId++}${b}`)
      for (const img of deco.images) {
        let outName = mediaNames.get(img.srcKey)
        if (!outName) {
          mediaCounter += 1
          outName = `decoImage${mediaCounter}.${img.ext}`
          zip.file(`ppt/media/${outName}`, img.data)
          mediaNames.set(img.srcKey, outName)
        }
        neededExt.add(img.ext)
        nextId += 1
        const newId = `rId${nextId}`
        relsXml = appendRelationship(relsXml, newId, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `../media/${outName}`)
        dxml = dxml.split(`r:embed="${img.oldId}"`).join(`r:embed="${newId}"`).split(`r:link="${img.oldId}"`).join(`r:link="${newId}"`)
      }
      injected += dxml
    }

    zip.file(slidePath, slideXml.replace('</p:spTree>', `${injected}</p:spTree>`))
    zip.file(relsPath, relsXml)
  }

  if (neededExt.size) {
    let ct = await readText(zip, '[Content_Types].xml')
    for (const ext of neededExt) ct = ensureDefaultContentType(ct, ext)
    zip.file('[Content_Types].xml', ct)
  }
}

export async function buildCombinedPptxData(buffers, JSZip) {
  const slides = []
  for (let i = 0; i < buffers.length; i++) {
    try {
      const zip = await JSZip.loadAsync(buffers[i])
      const deck = await extractDeckSlides(zip, i)
      slides.push(...deck)
    } catch {
      /* skip a deck we can't read rather than failing the whole export */
    }
  }
  if (!slides.length) throw new Error('No slides could be extracted from the PPTX files')

  const pptx = await buildPresentation(slides)
  let data = await pptx.write({ outputType: 'arraybuffer' })

  if (slides.some((s) => s.decorations && s.decorations.length)) {
    const zip = await JSZip.loadAsync(data)
    await injectDecorations(zip, slides)
    data = await zip.generateAsync({ type: 'uint8array' })
  } else {
    data = new Uint8Array(data)
  }
  return data
}

function saveBlob(blob, filename) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.rel = 'noopener'
  link.click()
  URL.revokeObjectURL(link.href)
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

  const data = await buildCombinedPptxData(buffers, JSZip)
  const blob = new Blob([data], { type: PPTX_MIME })
  saveBlob(blob, `${sanitizeFilename(setlistName || 'Setlist')}_worship.pptx`)
}
