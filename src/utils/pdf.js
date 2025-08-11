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

/**
 * computeLayout(songIn, opt, measureLyric)
 * - songIn: { title, key, lyricsBlocks:[{section?, lines:[{plain, chordPositions:[{index,sym}]}]}] }
 * - opt: see DEFAULT_LAYOUT_OPT
 * - measureLyric: (text) => width in pt, MUST match lyrics font used for PDF
 *
 * Returns:
 * {
 *   pages: [
 *     { columns: [
 *       { x, yStart, blocks: [
 *           { type:'section', header:'VERSE' },
 *           { type:'line', lyrics:'...', chords:[{ x, sym }, ...] }
 *       ] }
 *     ] }
 *   ]
 * }
 */
export function computeLayout(songIn, opt = {}, measureLyric = (t)=>0) {
  const song = normalizeSongInput(songIn)
  const o = { ...DEFAULT_LAYOUT_OPT, ...opt }
  const lineGap = 4
  const sectionSize = Math.max(o.lyricSizePt + 2, 16)

  const margin = o.margin
  const pageH = o.pageHeight
  const contentW = o.pageWidth - margin * 2
  const colW = o.columns === 2 ? (contentW - o.gutter) / 2 : contentW

  // Header metrics (mirror draw path)
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
  function newPage() {
    page = { columns: [] }
    pages.push(page)
  }
  if (page.columns.length === 0) makeColumns()

  let colIdx = 0
  let cursorY = contentStartY

  const curCol = () => page.columns[colIdx]
  const advanceColOrPage = () => {
    if (o.columns === 2 && colIdx === 0) {
      colIdx = 1
      cursorY = contentStartY
    } else {
      newPage()
      makeColumns()
      colIdx = 0
      cursorY = contentStartY
    }
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
    return h + 4 // block bottom padding
  }

  // Emit helpers
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
      // Determine the largest slice [start, end) that can fit in current column
      // but keep header attached to its first line.
      const col = curCol()

      // If nothing has been placed yet from this block and header exists, include it in height
      const minSliceH = measureBlockHeight(block, start, Math.min(start + 1, lines.length))
      if (cursorY + minSliceH > contentBottomY) {
        // Not even the header+first line fits -> advance column/page
        advanceColOrPage()
        continue
      }

      // Try to fit as many lines as possible
      let end = start + 1
      while (end <= lines.length) {
        const h = measureBlockHeight(block, start, end)
        if (cursorY + h > contentBottomY) break
        end++
      }
      end = Math.max(end - 1, start + 1) // at least one line (with header if start==0)

      // Emit this slice
      if (start === 0 && block.section) {
        pushSection(col, block.section)
        cursorY += sectionSize + 4
      }
      for (let i = start; i < end; i++) {
        const ln = lines[i]
        const plain = ln.plain || ln.text || ''
        const chordPositions = ln.chordPositions || []

        if (chordPositions.length) {
          // reserve chord row height in cursorY, but we only store blocks (y computed at draw time)
          // chords x were measured using lyrics widths
        }
        pushLine(col, plain, chordPositions)
        if (chordPositions.length) cursorY += o.chordSizePt + lineGap / 2
        cursorY += o.lyricSizePt + lineGap
      }
      cursorY += 4 // bottom padding for this slice

      // If we didn’t consume the whole block, advance to next column/page and continue
      start = end
      if (start < lines.length) {
        advanceColOrPage()
      }
    }
  }

  return { pages }
}


/** -----------------------------------------------------------------------
 *  DRAWING (consumes computeLayout)
 *  -------------------------------------------------------------------- */

function drawSongIntoDoc(doc, songIn, opt) {
  const lFam = String(opt.lyricFamily || 'Helvetica')
  const cFam = String(opt.chordFamily || 'Courier')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const o = {
    ...DEFAULT_LAYOUT_OPT,
    ...opt,
    pageWidth: pageW,
    pageHeight: pageH
  }

  const margin = o.margin
  const contentW = pageW - margin * 2
  const gutter = o.gutter
  const colW = o.columns === 2 ? (contentW - gutter) / 2 : contentW

  // Header
  const headerTitlePt = Math.max(22, o.lyricSizePt + 6)
  const headerKeyPt   = Math.max(12, o.lyricSizePt - 2)
  doc.setFont(lFam, 'bold');   doc.setFontSize(headerTitlePt)
  doc.text(o.title, margin, margin + 24)
  doc.setFont(lFam, 'italic'); doc.setFontSize(headerKeyPt)
  doc.text(`Key: ${o.key || '—'}`, margin, margin + 40)

  // Layout using the SAME measurement path
  const measure = makeLyricMeasurer(doc, lFam, o.lyricSizePt)
  const layout = computeLayout(songIn, o, measure)

  const lineGap = 4
  const sectionSize = Math.max(o.lyricSizePt + 2, 16)
  const contentStartY = margin + o.headerOffsetY

  // Iterate pages/columns/blocks and draw
  layout.pages.forEach((p, pIdx) => {
    if (pIdx > 0) doc.addPage()
    p.columns.forEach((col, cIdx) => {
      let x = col.x
      let y = contentStartY
      for (const b of col.blocks) {
        if (b.type === 'section') {
          doc.setFont(lFam, 'bold'); doc.setFontSize(sectionSize)
          doc.text(`[${b.header}]`, x, y)
          y += sectionSize + 4
        } else if (b.type === 'line') {
          // Draw chords at x + chord.x (precomputed from lyrics widths)
          if (b.chords?.length) {
            doc.setFont(cFam, 'bold'); doc.setFontSize(o.chordSizePt)
            for (const c of b.chords) {
              doc.text(c.sym, x + c.x, y)
            }
            y += o.chordSizePt + lineGap / 2
          }
          // Draw lyric line
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

export async function downloadSingleSongPdf(song, options) {
  // Decide columns like before, but use layout pages length instead of drawing twice.
  const probeDoc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = probeDoc.internal.pageSize.getWidth()
  const pageH = probeDoc.internal.pageSize.getHeight()
  const opt1 = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: 1,
    title: options?.title || (song.title || 'Untitled'),
    key: options?.key || (song.key || 'C'),
    margin: 36,
    lyricFamily: 'Helvetica',
    chordFamily: 'Courier',
    pageWidth: pageW,
    pageHeight: pageH
  }
  // Measuring with default fonts is fine for page count decision.
  const layout1 = computeLayout(normalizeSongInput(song), opt1, makeLyricMeasurer(probeDoc, opt1.lyricFamily, opt1.lyricSizePt))
  const needsTwoCols = layout1.pages.length > 1

  const finalDoc = await songToPdfDoc(song, { ...options, columns: needsTwoCols ? 2 : 1 })
  finalDoc.save(`${(song.title || 'Untitled').replace(/\s+/g, '_')}.pdf`)
}

export async function downloadMultiSongPdf(songs, options){
  const doc = await newPDF()
  const f = await ensureFontsEmbedded(doc)
  const baseOpt = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: 1,
    margin: 36,
    lyricFamily: f.lyricFamily || 'Helvetica',
    chordFamily: f.chordFamily || 'Courier'
  }
  let first = true
  for(const s of songs){
    if(!first) doc.addPage()
    first = false
    drawSongIntoDoc(
      doc,
      { title: s.title, key: s.key, lyricsBlocks: s.lyricsBlocks },
      { ...baseOpt, title: s.title, key: s.key }
    )
  }
  doc.save('GraceChords_Selection.pdf')
}
/** -----------------------------------------------------------------------
 *  TEST-ONLY METRICS (pure snapshot; no drawing)
 *  These mirror layout math exactly.
 *  -------------------------------------------------------------------- */
export function getLayoutMetrics(input, opts) {
  // Use a tiny jsPDF purely for measurement so we match production widths.
  const probe = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = probe.internal.pageSize.getWidth()
  const pageH = probe.internal.pageSize.getHeight()
  const o = {
    ...DEFAULT_LAYOUT_OPT,
    ...opts,
    pageWidth: pageW,
    pageHeight: pageH
  }
  // We do NOT embed fonts during tests by default. Helvetica metrics are deterministic and sufficient to catch algorithm regressions.
  const measure = makeLyricMeasurer(probe, o.lyricFamily, o.lyricSizePt)
  const layout = computeLayout(input, o, measure)

  // Normalize for snapshots (round chord x to 2 decimals)
  return layout.pages.map((page, pIdx) => ({
    p: pIdx,
    cols: page.columns.map((col, cIdx) => ({
      c: cIdx,
      blocks: col.blocks.map(b => ({
        t: b.type,
        h: b.type === 'section' ? b.header || null : null,
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
