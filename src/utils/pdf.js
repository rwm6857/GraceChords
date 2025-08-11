// src/utils/pdf.js
import { ensureFontsEmbedded } from './fonts'

/** -----------------------------------------------------------------------
 *  Lightweight jsPDF loader (keeps it out of the main bundle)
 *  -------------------------------------------------------------------- */
async function newPDF() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'pt', format: 'letter' })
}

/** -----------------------------------------------------------------------
 *  Input normalization
 *  -------------------------------------------------------------------- */
// Replace existing normalizeSongInput with this version:

function normalizeSongInput(input) {
  // Helper: "Verse", "Verse 1", "Chorus", "Bridge", "Tag", etc.
  const SECTION_RE = /^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i
  const isSectionLabel = (s) => SECTION_RE.test(String(s || '').trim())

  // Given lyricsBlocks, re-chunk lines into proper sectioned blocks when labels are plain lines
  const injectSectionsFromLines = (blocks) => {
    const out = []
    let cur = null
    const flush = () => { if (cur && cur.lines.length) out.push(cur); cur = null }

    for (const b of (blocks || [])) {
      if (b.section) {            // already a proper sectioned block, keep as-is
        flush()
        out.push(b)
        continue
      }
      for (const ln of (b.lines || [])) {
        const txt = ln.plain || ln.text || ''
        const hasChords = !!(ln.chordPositions && ln.chordPositions.length)
        if (!hasChords && isSectionLabel(txt)) {
          flush()
          cur = { section: txt.trim(), lines: [] } // start a new section; do NOT keep the label line as lyrics
        } else {
          if (!cur) cur = { lines: [] }           // unsectioned preamble
          cur.lines.push(ln)
        }
      }
    }
    flush()
    // If nothing matched, fall back to original
    return out.length ? out : (blocks || [])
  }

  // Case 1: already in lyricsBlocks shape
  if (input?.lyricsBlocks) {
    return {
      title: input.title || 'Untitled',
      key: input.key || input.originalKey || 'C',
      lyricsBlocks: injectSectionsFromLines(input.lyricsBlocks)
    }
  }

  // Case 2: parsed "blocks" shape (section/line)
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
      lyricsBlocks: injectSectionsFromLines(out)
    }
  }

  // Fallback
  return {
    title: input?.title || 'Untitled',
    key: input?.key || input?.originalKey || 'C',
    lyricsBlocks: []
  }
}


/** Create a lyrics-width measurer bound to a jsPDF doc + font settings */
function makeLyricMeasurer(doc, lyricFamily, lyricPt) {
  return (text) => {
    doc.setFont(lyricFamily, 'normal')
    doc.setFontSize(lyricPt)
    return doc.getTextWidth(text || '')
  }
}

/** -----------------------------------------------------------------------
 *  Pure layout config
 *  -------------------------------------------------------------------- */
const DEFAULT_LAYOUT_OPT = {
  lyricSizePt: 16,
  chordSizePt: 16,
  margin: 36,
  gutter: 18,
  headerOffsetY: 54,
  columns: 1,
  pageWidth: 612,  // Letter
  pageHeight: 792,
  lyricFamily: 'Helvetica',
  chordFamily: 'Courier',
  title: 'Untitled',
  key: 'C'
}

/** -----------------------------------------------------------------------
 *  PURE LAYOUT (two-pass; no drawing)
 *  - measures with lyrics font only
 *  - splits only at line boundaries
 *  - never orphans section header from first line
 *  - adds generous top pad above headers
 *  -------------------------------------------------------------------- */
export function computeLayout(songIn, opt = {}, measureLyric = (t)=>0) {
  const song = normalizeSongInput(songIn)
  const o = { ...DEFAULT_LAYOUT_OPT, ...opt }
  const lineGap = 4
  const sectionSize = o.lyricSizePt
  const sectionTopPad = Math.round(o.lyricSizePt * 0.85)

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
    if (hasHeader) h += sectionTopPad + sectionSize + 4
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
      const minSliceH = measureBlockHeight(block, start, Math.min(start + 1, lines.length))
      if (cursorY + minSliceH > contentBottomY) { advanceColOrPage(); continue }

      let end = start + 1
      while (end <= lines.length) {
        const h = measureBlockHeight(block, start, end)
        if (cursorY + h > contentBottomY) break
        end++
      }
      end = Math.max(end - 1, start + 1)

      const col = curCol()
      if (start === 0 && block.section) {
        cursorY += sectionTopPad
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
  const sectionSize = o.lyricSizePt
  const sectionTopPad = Math.round(o.lyricSizePt * 0.85)
  const contentStartY = margin + o.headerOffsetY

  layout.pages.forEach((p, pIdx) => {
    if (pIdx > 0) doc.addPage()
    p.columns.forEach((col) => {
      let x = col.x
      let y = contentStartY
      for (const b of col.blocks) {
        if (b.type === 'section') {
          y += sectionTopPad
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
 *  Fit planner (width-aware + height-aware, shrink-to-fit ≥12pt)
 *  -------------------------------------------------------------------- */
async function planFitOnOnePage(doc, songIn, baseOpt = {}) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const oBase = { ...DEFAULT_LAYOUT_OPT, ...baseOpt, pageWidth: pageW, pageHeight: pageH }

  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const lyricFamily = fams.lyricFamily || oBase.lyricFamily || 'Helvetica'
  const chordFamily = fams.chordFamily || oBase.chordFamily || 'Courier'

  const makeMeasureLyricAt = (pt) => (text) => {
    doc.setFont(lyricFamily, 'normal'); doc.setFontSize(pt)
    return doc.getTextWidth(text || '')
  }
  const makeMeasureChordAt = (pt) => (text) => {
    doc.setFont(chordFamily, 'bold'); doc.setFontSize(pt)
    return doc.getTextWidth(text || '')
  }

  const overflowsWidth = (song, columns, size) => {
    const margin = oBase.margin
    const contentW = pageW - margin * 2
    const colW = columns === 2 ? (contentW - oBase.gutter) / 2 : contentW
    const measureLyric = makeMeasureLyricAt(size)
    const measureChord = makeMeasureChordAt(size)
    for (const block of (song.lyricsBlocks || [])) {
      for (const ln of (block.lines || [])) {
        const plain = ln.plain || ln.text || ''
        const lyrW = measureLyric(plain)
        if (lyrW > colW) return true
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

  const startSize = Math.max(12, Math.round(baseOpt?.lyricSizePt || 16))
  const minSize = 12

  for (let size = startSize; size >= minSize; size--) {
    for (const cols of [2, 1]) {
      const o = { ...oBase, lyricFamily, chordFamily, columns: cols, lyricSizePt: size, chordSizePt: size }
      const measure = makeLyricMeasurer(doc, lyricFamily, size)
      const layout = computeLayout(songIn, o, measure)
      const widthOk = !overflowsWidth(songIn, cols, size)
      const heightOk = layout.pages.length <= 1
      if (widthOk && heightOk) {
        return { columns: cols, lyricSizePt: size, chordSizePt: size, lyricFamily, chordFamily, layout }
      }
    }
  }

  // Fallback: 12pt, choose plan with fewer pages (penalize width overflow)
  const size = minSize
  let best = null
  for (const cols of [2, 1]) {
    const o = { ...oBase, lyricFamily, chordFamily, columns: cols, lyricSizePt: size, chordSizePt: size }
    const measure = makeLyricMeasurer(doc, lyricFamily, size)
    const layout = computeLayout(songIn, o, measure)
    const widthOk = !overflowsWidth(songIn, cols, size)
    const score = layout.pages.length + (widthOk ? 0 : 0.5)
    if (!best || score < best.score) best = { plan: { columns: cols, lyricSizePt: size, chordSizePt: size, lyricFamily, chordFamily, layout }, score }
  }
  return best.plan
}

/** -----------------------------------------------------------------------
 *  PUBLIC APIS
 *  -------------------------------------------------------------------- */
export async function songToPdfDoc(song, options){
  const doc = await newPDF()
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const plan = await planFitOnOnePage(doc, normalizeSongInput(song), {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    title: options?.title || song.title || 'Untitled',
    key: options?.key || song.key || 'C',
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier'
  })
  drawSongIntoDoc(doc, song, { ...plan, title: plan.title || (options?.title || song.title), key: plan.key || (options?.key || song.key) })
  return doc
}

export async function downloadSingleSongPdf(song, options) {
  const doc = await newPDF()
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const base = {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    title: options?.title || (song.title || 'Untitled'),
    key: options?.key || (song.key || 'C'),
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier'
  }
  const plan = await planFitOnOnePage(doc, normalizeSongInput(song), base)
  drawSongIntoDoc(doc, song, { ...base, ...plan })
  doc.save(`${(base.title).replace(/\s+/g, '_')}.pdf`)
}

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
    const songNorm = normalizeSongInput(s)
    const plan = await planFitOnOnePage(doc, songNorm, { ...baseOpt, title: s.title || 'Untitled', key: s.key || 'C' })
    drawSongIntoDoc(doc, s, { ...baseOpt, ...plan, title: s.title || 'Untitled', key: s.key || 'C' })
  }
  doc.save('GraceChords_Selection.pdf')
}

/** -----------------------------------------------------------------------
 *  TEST-ONLY METRICS (sync; no jsPDF dependency)
 *  -------------------------------------------------------------------- */
export function getLayoutMetrics(input, opts) {
  const o = { ...DEFAULT_LAYOUT_OPT, ...opts }
  // Letter defaults for tests
  o.pageWidth = 612
  o.pageHeight = 792

  // Deterministic, doc-free measurer (approximate but stable)
  const measure = (text) => (text ? text.length * (o.lyricSizePt * 0.6) : 0)
  const layout = computeLayout(normalizeSongInput(input), o, measure)

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
