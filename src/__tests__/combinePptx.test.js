import { describe, expect, test } from 'vitest'
import JSZip from 'jszip'
import {
  extractLinesFromSlideXml,
  extractDeckSlides,
  buildPresentation,
  fitFontSize,
} from '../utils/export/combinePptx.js'

const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

function slideXml(paragraphs) {
  const body = paragraphs
    .map((runs) => {
      const texts = (Array.isArray(runs) ? runs : [runs])
        .map((t) => `<a:r><a:t>${t}</a:t></a:r>`)
        .join('')
      return `<a:p>${texts}</a:p>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">
  <p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
}

// Build a minimal valid-enough source deck where slide *file* numbering is the
// reverse of presentation order, to prove we honor sldIdLst rather than names.
function makeSourceDeck(slidesInOrder) {
  const zip = new JSZip()
  // file slideN.xml holds slidesInOrder[N-1] reversed vs. presentation order
  const fileForOrder = (i) => slidesInOrder.length - i // 1-based file number
  const sldIds = slidesInOrder
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join('')
  const rels = slidesInOrder
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${fileForOrder(i)}.xml"/>`
    )
    .join('')

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="${P_NS}" xmlns:r="${R_NS}"><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
  )
  slidesInOrder.forEach((paras, i) => {
    zip.file(`ppt/slides/slide${fileForOrder(i)}.xml`, slideXml(paras))
  })
  return zip
}

describe('extractLinesFromSlideXml', () => {
  test('one line per non-empty paragraph, runs concatenated', () => {
    const xml = slideXml([['Above all powers, ', 'above all kings'], ['Above all nature and all created things']])
    expect(extractLinesFromSlideXml(xml)).toEqual([
      'Above all powers, above all kings',
      'Above all nature and all created things',
    ])
  })

  test('soft line breaks (<a:br/>) split a paragraph into separate lines', () => {
    const xml = `<?xml version="1.0"?>
<p:sld xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>You're the God who formed my heart</a:t></a:r><a:br/><a:r><a:t>All of me</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
    expect(extractLinesFromSlideXml(xml)).toEqual([
      "You're the God who formed my heart",
      'All of me',
    ])
  })

  test('empty paragraphs (blank separator slide) yield no lines', () => {
    expect(extractLinesFromSlideXml(slideXml([['']]))).toEqual([])
    expect(extractLinesFromSlideXml(slideXml([]))).toEqual([])
  })
})

describe('extractDeckSlides', () => {
  test('reads slides in presentation order, not filename order', async () => {
    const deck = makeSourceDeck([
      [['Above all']],
      [['']], // blank separator
      [['Verse line one'], ['Verse line two']],
    ])
    const slides = await extractDeckSlides(deck)
    expect(slides.map((s) => s.lines)).toEqual([
      ['Above all'],
      [],
      ['Verse line one', 'Verse line two'],
    ])
  })
})

describe('fitFontSize', () => {
  // No canvas in happy-dom, so only the height bound applies here.
  test('one or two lines stay at the 50pt max', () => {
    expect(fitFontSize(['Above all'])).toBe(50)
    expect(fitFontSize(['line one', 'line two'])).toBe(50)
  })

  test('stays within the 46-50 range even for many lines', () => {
    const five = fitFontSize(['a', 'b', 'c', 'd', 'e'])
    expect(five).toBeLessThanOrEqual(50)
    expect(five).toBeGreaterThanOrEqual(46)
  })

  test('never drops below the 46pt floor', () => {
    expect(fitFontSize(Array(40).fill('x'))).toBe(46)
  })
})

describe('buildPresentation', () => {
  test('produces a single-master 16:9 black deck with standardized text', async () => {
    const pptx = await buildPresentation([
      { lines: ['Above all powers, above all kings', 'Above all nature and all created things'] },
      { lines: [] },
      { lines: ['Above all'] },
    ])
    const b64 = await pptx.write({ outputType: 'base64' })
    const zip = await JSZip.loadAsync(b64, { base64: true })
    const names = Object.keys(zip.files)

    const masters = names.filter((n) => /ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n))
    expect(masters).toHaveLength(1)

    const slideFiles = names.filter((n) => /ppt\/slides\/slide\d+\.xml$/.test(n))
    expect(slideFiles).toHaveLength(3)

    const pres = await zip.file('ppt/presentation.xml').async('string')
    // 13.333in x 7.5in => 12191995?ish x 6858000 EMU; assert height is exactly 7.5in.
    expect(pres).toMatch(/cy="6858000"/)

    const slide1 = await zip.file('ppt/slides/slide1.xml').async('string')
    expect(slide1).toMatch(/Calibri/)
    expect(slide1).toMatch(/sz="5000"/) // 50pt cap
    expect(slide1).toMatch(/b="1"/) // bold
    expect(slide1).toMatch(/FFFFFF/i)
    expect(slide1).toMatch(/anchor="ctr"/) // text anchored to box center
    expect(slide1).toMatch(/Above all powers/)
  })
})
