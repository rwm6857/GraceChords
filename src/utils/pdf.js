// import { jsPDF } from 'jspdf'
import { ensureFontsEmbedded } from './fonts'

/** -----------------------------------------------------------------------
 *  Helpers & adapters
 *  -------------------------------------------------------------------- */

async function newPDF() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit:'pt', format:'letter' })
}
/** Normalize input to the shape your renderer already uses:
 *  { title, key, lyricsBlocks: [{ section?: string, lines: [{ plain, chordPositions:[{index,sym}] }] }] }
 */
function normalizeSongInput(input) {
  if (input?.lyricsBlocks) {
    return {
      title: input.title || 'Untitled',
      key: input.key || input.originalKey || 'C',
      lyricsBlocks: input.lyricsBlocks
    }
  }
  // Adapter for parsed structures like: { title, originalKey, blocks:[ {type:'section'|'line', header?, lyrics?, chords?:[{index,sym}]} ] }
  if (Array.isArray(input?.blocks)) {
    const out = []
    let cur = { lines: [] }
    for (const b of input.blocks) {
      if (b.type === 'section') {
        if (cur.lines.length) out.push(cur)
        cur = { section: b.header, lines: [] }
      } else if (b.type === 'line') {
        cur.lines.push({
          plain: b.lyrics || b.text || '',
          chordPositions: (b.chords || []).map(c => ({ index: c.index ?? 0, sym: c.sym }))
        })
      }
    }
    if (cur.lines.length) out.push(cur)
    return {
      title: input.title || 'Untitled',
      key: input.key || input.originalKey || 'C',
      lyricsBlocks: out
    }
  }
  // Fallback (empty)
  return {
    title: input?.title || 'Untitled',
    key: input?.key || input?.originalKey || 'C',
    lyricsBlocks: []
  }
}

/** Create a lyrics-width measurer bound to a jsPDF doc + font settings */
function makeLyricMeasurer(doc, lyricFamily, lyricPt) {
  return (text) => {
    // Ensure measurement matches how lyrics are drawn
    doc.setFont(lyricFamily, 'normal')
    doc.setFontSize(lyricPt)
    return doc.getTextWidth(text || '')
  }
}

/** Choose columns and sizes that fit ≦1 page if possible (down to 12pt). */
async function planFitOnOnePage(doc, songIn, baseOpt = {}) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const oBase = {
    ...DEFAULT_LAYOUT_OPT,
    ...baseOpt,
    pageWidth: pageW,
    pageHeight: pageH
  }

  // Ensure exact fonts (so width checks match draw)
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const lyricFamily = fams.lyricFamily || oBase.lyricFamily || 'Helvetica'
  const chordFamily = fams.chordFamily || oBase.chordFamily || 'Courier'

  // Helpers to measure widths with correct fonts
  const makeMeasureLyricAt = (pt) => {
    return (text) => {
      doc.setFont(lyricFamily, 'normal')
      doc.setFontSize(pt)
      return doc.getTextWidth(text || '')
    }
  }
  const makeMeasureChordAt = (pt) => {
    return (text) => {
      doc.setFont(chordFamily, 'bold')
      doc.setFontSize(pt)
      return doc.getTextWidth(text || '')
    }
  }

  // Width overflow check for a given (columns, size)
  const overflowsWidth = (song, columns, size) => {
    const margin = oBase.margin
    const contentW = pageW - margin * 2
    const colW = columns === 2 ? (contentW - oBase.gutter) / 2 : contentW
    const measureLyric = makeMeasureLyricAt(size)
    const measureChord = makeMeasureChordAt(size)

    for (const block of (song.lyricsBlocks || [])) {
      for (const ln of (block.lines || [])) {
        const plain = ln.plain || ln.text || ''
        // lyrics width must fit in column
        const lyrW = measureLyric(plain)
        if (lyrW > colW) return true

        // chords: x (from lyric width) + chord symbol width must fit
        const cps = ln.chordPositions || []
        for (const c of cps) {
          const x = measureLyric(plain.slice(0, c.index || 0))
          const cw = measureChord(c.sym || '')
          if (x + cw > colW) return true
        }
      }
    }
    return false
  }

  // Try sizes from current down to 12pt
  const startSize = Math.max(12, Math.round(baseOpt?.lyricSizePt || 16))
  const minSize = 12

  // Prefer 2 columns first (height saver), then 1 column (width saver)
  for (let size = startSize; size >= minSize; size--) {
    for (const cols of [2, 1]) {
      const measure = makeMeasureLyricAt(size)
      const o = { ...oBase, lyricFamily, chordFamily, columns: cols, lyricSizePt: size, chordSizePt: size }
      const layout = computeLayout(songIn, o, measure)

      const widthOk = !overflowsWidth(songIn, cols, size)
      const heightOk = layout.pages.length <= 1
      if (widthOk && heightOk) {
        return { columns: cols, lyricSizePt: size, chordSizePt: size, lyricFamily, chordFamily, layout }
      }
    }
  }

  // Couldn’t make 1 page without overflow — choose the “least bad”:
  // Use 12pt, pick the column setting with less page count (favor 1-col if 2-col causes width overflow).
  const size = minSize
  let best = null
  for (const cols of [2, 1]) {
    const o = { ...oBase, lyricFamily, chordFamily, columns: cols, lyricSizePt: size, chordSizePt: size }
    const measure = makeMeasureLyricAt(size)
    const layout = computeLayout(songIn, o, measure)
    const widthOk = !overflowsWidth(songIn, cols, size)
    const score = (layout.pages.length) + (widthOk ? 0 : 0.5) // prefer fewer pages; penalize width overflow
    if (!best || score < best.score) best = { plan: { columns: cols, lyricSizePt: size, chordSizePt: size, lyricFamily, chordFamily, layout }, score }
  }
  return best.plan
}

/** -----------------------------------------------------------------------
 *  PURE LAYOUT (source of truth)
 *  Computes pages/columns/blocks and chord X offsets from lyrics widths.
 *  No drawing here.
 *  -------------------------------------------------------------------- */

const DEFAULT_LAYOUT_OPT = {
  lyricSizePt: 16,
  chordSizePt: 16,
  margin: 36,
  gutter: 18,
  headerOffsetY: 54, // space below header before content
  columns: 1,
  pageWidth: 612,     // Letter pt (jsPDF default ~ 612x792) – we’ll read from doc in runtime path
  pageHeight: 792,
  lyricFamily: 'Helvetica',
  chordFamily: 'Courier',
  title: 'Untitled',
  key: 'C'
}

// utils/pdf.js
export function computeLayout(songIn, opt = {}, measureLyric = (t)=>0) {
  const song = normalizeSongInput(songIn)
  const o = { ...DEFAULT_LAYOUT_OPT, ...opt }
  const lineGap = 4
  const sectionSize = Math.max(o.lyricSizePt + 2, 16)

  const margin = o.margin
  const pageH = o.pageHeight
  const contentW = o.pageWidth - margin * 2
  const colW = o.columns === 2 ? (contentW - o.gutter) / 2 : contentW

  const contentStartY = margin + o.headerOffsetY
  const contentBottomY = pageH - margin

  const pages = []
  let page = { columns: [] }
  pages.push(page)

  function makeColumns() {
    const firstCol = { x: margin, yStart: contentStartY, blocks: [] }
    page.columns.push(firstCol)
    if (o.columns === 2) {
      const secondCol = { x: margin + colW + o.gutter, yStart: contentStartY, blocks: [] }
      page.columns.push(secondCol)
    }
  }
  function newPage() { page = { columns: [] }; pages.push(page) }
  if (page.columns.length === 0) makeColumns()

  let colIdx = 0
  let cursorY = contentStartY
  const curCol = () => page.columns[colIdx]
  const advanceColOrPage = () => {
    if (o.columns === 2 && colIdx === 0) { colIdx = 1; cursorY = contentStartY }
    else { newPage(); makeColumns(); colIdx = 0; cursorY = contentStartY }
  }

  const measureBlockHeight = (block, fromLine = 0, toLineExclusive = (block.lines?.length ?? 0)) => {
    let h = 0
    const hasHeader = !!block.section && fromLine === 0
    if (hasHeader) h += sectionSize + 4
    for (let i = fromLine; i < toLineExclusive; i++) {
      const ln = block.lines[i]
      if (ln?.chordPositions?.length) h += o.chordSizePt + lineGap / 2
      h += o.lyricSizePt + lineGap
    }
    return h + 4
  }

  const pushSection = (col, header) => col.blocks.push({ type: 'section', header: String(header).toUpperCase() })
  const pushLine = (col, plain, chordPositions) => {
    const chords = (chordPositions || []).map(c => ({
      sym: c.sym,
      x: measureLyric(plain.slice(0, c.index || 0))
    }))
    col.blocks.push({ type: 'line', lyrics: plain, chords })
  }

  for (const block of song.lyricsBlocks) {
    const lines = block.lines || []
    let start = 0
    while (start < lines.length) {
      const col = curCol()
      const minSliceH = measureBlockHeight(block, start, Math.min(start + 1, lines.length))
      if (cursorY + minSliceH > contentBottomY) { advanceColOrPage(); continue }

      let end = start + 1
      while (end <= lines.length) {
        const h = measureBlockHeight(block, start, end)
        if (cursorY + h > contentBottomY) break
        end++
      }
      end = Math.max(end - 1, start + 1)

      if (start === 0 && block.section) {
        pushSection(col, block.section)
        cursorY += sectionSize + 4
      }
      for (let i = start; i < end; i++) {
        const ln = lines[i]
        const plain = ln.plain || ln.text || ''
        const chordPositions = ln.chordPositions || []
        pushLine(col, plain, chordPositions)
        if (chordPositions.length) cursorY += o.chordSizePt + lineGap / 2
        cursorY += o.lyricSizePt + lineGap
      }
      cursorY += 4

      start = end
      if (start < lines.length) advanceColOrPage()
    }
  }

  return { pages }
}



/** -----------------------------------------------------------------------
 *  DRAWING (consumes computeLayout)
 *  -------------------------------------------------------------------- */

/** Draw stays unchanged (consumes computeLayout) */
function drawSongIntoDoc(doc, songIn, opt) {
  const lFam = String(opt.lyricFamily || 'Helvetica')
  const cFam = String(opt.chordFamily || 'Courier')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const o = { ...DEFAULT_LAYOUT_OPT, ...opt, pageWidth: pageW, pageHeight: pageH }

  const margin = o.margin
  const headerTitlePt = Math.max(22, o.lyricSizePt + 6)
  const headerKeyPt   = Math.max(12, o.lyricSizePt - 2)

  // Header
  doc.setFont(lFam, 'bold');   doc.setFontSize(headerTitlePt)
  doc.text(o.title, margin, margin + 24)
  doc.setFont(lFam, 'italic'); doc.setFontSize(headerKeyPt)
  doc.text(`Key: ${o.key || '—'}`, margin, margin + 40)

  // Layout + draw
  const measure = makeLyricMeasurer(doc, lFam, o.lyricSizePt)
  const layout = computeLayout(songIn, o, measure)

  const lineGap = 4
  const sectionSize = Math.max(o.lyricSizePt + 2, 16)
  const contentStartY = margin + o.headerOffsetY

  layout.pages.forEach((p, pIdx) => {
    if (pIdx > 0) doc.addPage()
    p.columns.forEach((col) => {
      let x = col.x
      let y = contentStartY
      for (const b of col.blocks) {
        if (b.type === 'section') {
          doc.setFont(lFam, 'bold'); doc.setFontSize(sectionSize)
          doc.text(`[${b.header}]`, x, y)
          y += sectionSize + 4
        } else if (b.type === 'line') {
          if (b.chords?.length) {
            doc.setFont(cFam, 'bold'); doc.setFontSize(o.chordSizePt)
            for (const c of b.chords) doc.text(c.sym, x + c.x, y)
            y += o.chordSizePt + lineGap / 2
          }
          doc.setFont(lFam, 'normal'); doc.setFontSize(o.lyricSizePt)
          doc.text(b.lyrics, x, y)
          y += o.lyricSizePt + lineGap
        }
      }
    })
  })
}


/** -----------------------------------------------------------------------
 *  PUBLIC PDF APIS (unchanged behavior)
 *  -------------------------------------------------------------------- */

export async function songToPdfDoc(song, options){
  const doc = await newPDF()
  const opt = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: options?.columns || 1,
    title: options?.title || song.title,
    key: options?.key || song.key,
    margin: 36,
    lyricFamily: 'Helvetica',
    chordFamily: 'Courier'
  }
  try{
    const f = await ensureFontsEmbedded(doc)
    opt.lyricFamily = f.lyricFamily || opt.lyricFamily
    opt.chordFamily = f.chordFamily || opt.chordFamily
  }catch{}
  drawSongIntoDoc(doc, song, opt)
  return doc
}

/** SINGLE — now with shrink-to-fit by default (≥12pt), and fixed dynamic import */
export async function downloadSingleSongPdf(song, options) {
  const doc = await newPDF()
  // Embed once so our measurement is accurate and drawing is vector with Noto
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const base = {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    // columns decided by planFitOnOnePage
    title: options?.title || (song.title || 'Untitled'),
    key: options?.key || (song.key || 'C'),
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier'
  }

  const plan = await planFitOnOnePage(doc, song, base)
  drawSongIntoDoc(doc, song, { ...base, ...plan })
  doc.save(`${(base.title).replace(/\s+/g, '_')}.pdf`)
}


/** MULTI — each song starts on its own page; each attempts to fit on 1 page (≥12pt) */
export async function downloadMultiSongPdf(songs, options){
  const doc = await newPDF()
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}

  const baseOpt = {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier'
  }

  let first = true
  for (const s of songs) {
    if (!first) doc.addPage()
    first = false

    const songOpt = {
      ...baseOpt,
      title: s.title || 'Untitled',
      key: s.key || 'C'
    }
    // Plan fit for THIS song with this doc (consistent metrics)
    const plan = await planFitOnOnePage(doc, s, songOpt)
    drawSongIntoDoc(doc, s, { ...songOpt, ...plan })
  }
  doc.save('GraceChords_Selection.pdf')
}
/** -----------------------------------------------------------------------
 *  TEST-ONLY METRICS (pure snapshot; no drawing)
 *  These mirror layout math exactly.
 *  -------------------------------------------------------------------- */
export function getLayoutMetrics(input, opts) {
  // Try to use jsPDF if it happens to be available; otherwise fall back
  let probe = null
  try {
    if (typeof jsPDF !== 'undefined') {
      probe = new jsPDF({ unit: 'pt', format: 'letter' })
    }
  } catch {}

  // Defaults (Letter) when no jsPDF
  let pageW = 612
  let pageH = 792

  const o = { ...DEFAULT_LAYOUT_OPT, ...opts }
  if (probe) {
    pageW = probe.internal.pageSize.getWidth()
    pageH = probe.internal.pageSize.getHeight()
  }
  o.pageWidth = pageW
  o.pageHeight = pageH

  // Deterministic width measurer:
  // - If we have jsPDF, measure like production (lyrics font).
  // - Else, use a stable approximation that scales with lyricSizePt.
  const measure = probe
    ? makeLyricMeasurer(probe, o.lyricFamily, o.lyricSizePt)
    : (text) => (text ? text.length * (o.lyricSizePt * 0.6) : 0)

  const layout = computeLayout(input, o, measure)

  // Normalize for snapshots (round chord x to 2 decimals)
  return layout.pages.map((page, pIdx) => ({
    p: pIdx,
    cols: page.columns.map((col, cIdx) => ({
      c: cIdx,
      blocks: col.blocks.map(b => ({
        t: b.type,
        h: b.type === 'section' ? (b.header || null) : null,
        line: b.type === 'line'
          ? {
              text: b.lyrics,
              chords: (b.chords || []).map(ch => ({ x: Number(ch.x.toFixed(2)), s: ch.sym }))
            }
          : null
      }))
    }))
  }))
}

