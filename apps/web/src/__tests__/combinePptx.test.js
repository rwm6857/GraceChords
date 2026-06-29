import { describe, expect, test } from 'vitest'
import JSZip from 'jszip'
import {
  extractLinesFromSlideXml,
  extractDeckSlides,
  buildPresentation,
  buildCombinedPptxData,
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

  test('a run of 2+ spaces is treated as a line break', () => {
    const xml = slideXml([['You’re the God who formed my heart  All of me']])
    expect(extractLinesFromSlideXml(xml)).toEqual([
      'You’re the God who formed my heart',
      'All of me',
    ])
  })

  test('empty paragraphs (blank separator slide) yield no lines', () => {
    expect(extractLinesFromSlideXml(slideXml([['']]))).toEqual([])
    expect(extractLinesFromSlideXml(slideXml([]))).toEqual([])
  })
})

// A deck whose theme/master/layout resolve tx1 -> black and bg1 -> white, used
// to exercise hidden-text detection and flag preservation end to end.
function makeRichDeck() {
  const zip = new JSZip()
  const rels = (entries) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`

  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0"?><a:theme xmlns:a="${A_NS}"><a:themeElements><a:clrScheme name="x">` +
      '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
      '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="111111"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>' +
      '</a:clrScheme></a:themeElements></a:theme>'
  )
  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0"?><p:sldMaster xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">` +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/>' +
      '<p:txStyles>' +
      '<p:titleStyle><a:lvl1pPr><a:defRPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle>' +
      '<p:bodyStyle><a:lvl1pPr><a:defRPr><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:bodyStyle>' +
      '<p:otherStyle/></p:txStyles></p:sldMaster>'
  )
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'))
  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0"?><p:sldLayout xmlns:p="${P_NS}" xmlns:a="${A_NS}"><p:cSld><p:spTree>` +
      '<p:nvGrpSpPr/><p:grpSpPr/>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="10"/></p:nvPr></p:nvSpPr>' +
      '<p:txBody><a:lstStyle><a:lvl1pPr><a:defRPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle></p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:sldLayout>'
  )
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'))

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation xmlns:p="${P_NS}" xmlns:r="${R_NS}"><p:sldIdLst>` +
      '<p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>'
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    rels(
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>'
    )
  )

  // slide1: ctrTitle (inherits black -> hidden) + body (layout makes white)
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0"?><p:sld xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"><p:cSld><p:spTree>` +
      '<p:nvGrpSpPr/><p:grpSpPr/>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>HIDDEN RELIC</a:t></a:r></a:p></p:txBody></p:sp>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="10"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Visible lyric</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:sld>'
  )
  zip.file('ppt/slides/_rels/slide1.xml.rels', rels('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'))

  // slide2: a flag group (pic + label) plus a lyric; two stacked copies of the
  // group at the same position to verify dedupe.
  const flagGroup = (id) =>
    '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="' + id + '" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="8000000" y="100000"/><a:ext cx="800000" cy="800000"/><a:chOff x="0" y="0"/><a:chExt cx="800000" cy="800000"/></a:xfrm></p:grpSpPr>' +
    '<p:pic><p:nvPicPr><p:cNvPr id="' + (id + 1) + '" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>' +
    '<p:blipFill><a:blip r:embed="rId3"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="800000" cy="500000"/></a:xfrm></p:spPr></p:pic>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="' + (id + 2) + '" name="l"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    '<p:txBody><a:p><a:r><a:rPr><a:solidFill><a:prstClr val="white"/></a:solidFill></a:rPr><a:t>Israel</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>'
  zip.file(
    'ppt/slides/slide2.xml',
    `<?xml version="1.0"?><p:sld xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"><p:cSld><p:spTree>` +
      '<p:nvGrpSpPr/><p:grpSpPr/>' +
      flagGroup(10) +
      flagGroup(20) +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="10"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Great is the Lord</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:sld>'
  )
  zip.file(
    'ppt/slides/_rels/slide2.xml.rels',
    rels(
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>'
    )
  )
  zip.file('ppt/media/image1.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return zip
}

describe('extractDeckSlides — hidden text & flags', () => {
  test('drops text that resolves to black, keeps visible lyric', async () => {
    const slides = await extractDeckSlides(makeRichDeck(), 0)
    expect(slides[0].lines).toEqual(['Visible lyric'])
  })

  test('flag label stays out of the lyric box; lyric preserved', async () => {
    const slides = await extractDeckSlides(makeRichDeck(), 0)
    expect(slides[1].lines).toEqual(['Great is the Lord'])
  })

  test('stacked duplicate flag groups dedupe to one decoration with its image', async () => {
    const slides = await extractDeckSlides(makeRichDeck(), 0)
    expect(slides[1].decorations).toHaveLength(1)
    expect(slides[1].decorations[0].images).toHaveLength(1)
    expect(slides[1].decorations[0].xml).toContain('Israel')
  })

  test('buildCombinedPptxData injects the flag, copies its image, drops hidden text', async () => {
    const buf = await makeRichDeck().generateAsync({ type: 'uint8array' })
    const data = await buildCombinedPptxData([buf], JSZip)
    const out = await JSZip.loadAsync(data)
    const names = Object.keys(out.files)

    expect(names.some((n) => /ppt\/media\/decoImage\d+\.png$/.test(n))).toBe(true)
    const slide2 = await out.file('ppt/slides/slide2.xml').async('string')
    expect(slide2).toContain('<p:grpSp>')
    expect(slide2).toContain('Israel')
    expect((slide2.match(/<p:grpSp>/g) || []).length).toBe(1) // deduped
    const slide1 = await out.file('ppt/slides/slide1.xml').async('string')
    expect(slide1).not.toContain('HIDDEN RELIC')
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
