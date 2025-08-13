// src/utils/pdfLayout.js
// Pure layout planning helpers shared by PDF and image exporters.

// Detect common section labels in plain text lines
function isSectionLabel(text = '') {
  return /^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i
    .test(String(text).trim())
}

// Normalize various song input shapes into a canonical form
export function normalizeSongInput(input) {
  const injectSectionsFromLines = (blocks) => {
    const out = []
    let cur = null
    const flush = () => { if (cur && cur.lines.length) out.push(cur); cur = null }

    for (const b of (blocks || [])) {
      if (b.section) { flush(); out.push(b); continue }
      for (const ln of (b.lines || [])) {
        const txt = ln.plain || ln.text || ''
        const hasChords = !!(ln.chordPositions && ln.chordPositions.length)
        if (!hasChords && isSectionLabel(txt)) {
          flush()
          cur = { section: txt.trim(), lines: [] }
        } else {
          if (!cur) cur = { lines: [] }
          cur.lines.push(ln)
        }
      }
    }
    flush()
    return out.length ? out : (blocks || [])
  }

  // Already normalized
  if (input?.lyricsBlocks) {
    return {
      title: input.title || 'Untitled',
      key: input.key || input.originalKey || 'C',
      lyricsBlocks: injectSectionsFromLines(input.lyricsBlocks)
    }
  }

  // From parsed "blocks"
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

  return {
    title: input?.title || 'Untitled',
    key: input?.key || input?.originalKey || 'C',
    lyricsBlocks: []
  }
}

// Default layout options used by the planner
export const DEFAULT_LAYOUT_OPT = {
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

// Safety against kissing the right gutter
const RIGHT_SAFETY = 6 // pt

/**
 * Pure width check using provided measurers (lyrics/chords).
 * Respects the alignment invariant: chord X measured in lyrics font; chords drawn in mono bold.
 */
function widthOverflows(song, columns, size, oBase, makeMeasureLyricAt, makeMeasureChordAt) {
  const margin = oBase.margin
  const contentW = oBase.pageWidth - margin * 2
  const colW = columns === 2 ? (contentW - oBase.gutter) / 2 : contentW
  const limit = colW - RIGHT_SAFETY

  const measureLyric = makeMeasureLyricAt(size)
  const measureChord = makeMeasureChordAt(size)

  for (const block of (song.lyricsBlocks || [])) {
    for (const ln of (block.lines || [])) {
      const plain = ln.plain || ln.text || ''
      if (measureLyric(plain) > limit) return true
      for (const c of (ln.chordPositions || [])) {
        const x = measureLyric(plain.slice(0, c.index || 0))
        const cw = measureChord(c.sym || '')
        if (x + cw > limit) return true
      }
    }
  }
  return false
}

/**
 * Search for the best layout using planSongLayout.
 * Tries 1→2 columns and shrinks font size down to 14pt.
 * Returns the chosen plan and the options used.
 */
export function chooseBestLayout(songIn, baseOpt = {}, makeMeasureLyricAt = () => () => 0, makeMeasureChordAt = () => () => 0) {
  const song = normalizeSongInput(songIn)
  const oBase = { ...DEFAULT_LAYOUT_OPT, ...baseOpt }
  const minSize = 12
  const startSize = oBase.lyricSizePt

  const candidates = []
  const tryPlan = (cols, size) => {
    const layout = planSongLayout(song, { ...oBase, columns: cols, lyricSizePt: size, chordSizePt: size }, makeMeasureLyricAt(size))
    const widthOk = !widthOverflows(song, cols, size, oBase, makeMeasureLyricAt, makeMeasureChordAt)
    return { columns: cols, lyricSizePt: size, chordSizePt: size, layout, widthOk }
  }

  const initialCols = oBase.columns === 2 ? 2 : 1
  candidates.push(tryPlan(initialCols, startSize))

  let last = candidates[candidates.length - 1]
  if (initialCols === 1 && (last.layout.pages.length > 1 || !last.widthOk)) {
    let size = startSize
    candidates.push(tryPlan(2, size))
    last = candidates[candidates.length - 1]
    while ((last.layout.pages.length > 1 || !last.widthOk) && size > minSize) {
      size--
      last = tryPlan(2, size)
      candidates.push(last)
    }
  } else {
    let size = startSize
    while ((last.layout.pages.length > 1 || !last.widthOk) && size > minSize) {
      size--
      last = tryPlan(initialCols, size)
      candidates.push(last)
    }
  }

  candidates.sort((a, b) => {
    if (a.layout.pages.length !== b.layout.pages.length) return a.layout.pages.length - b.layout.pages.length
    if (a.widthOk !== b.widthOk) return a.widthOk ? -1 : 1
    if (a.columns !== b.columns) return a.columns - b.columns
    return b.lyricSizePt - a.lyricSizePt
  })

  const best = candidates[0]
  return {
    plan: { ...oBase, columns: best.columns, lyricSizePt: best.lyricSizePt, chordSizePt: best.chordSizePt, layout: best.layout },
    chosenOpts: { columns: best.columns, lyricSizePt: best.lyricSizePt, chordSizePt: best.chordSizePt }
  }
}

// Public layout function (was computeLayout). Pure; does not select sizes/columns.
export function planSongLayout(songIn, opt = {}, measureLyric = (t) => 0) {
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

  // Fallback: if a block’s first line is a label with no chords, promote it to a section header
  song.lyricsBlocks = (song.lyricsBlocks || []).map(b => {
    if (!b?.section && Array.isArray(b?.lines) && b.lines.length) {
      const first = b.lines[0]
      const txt = first?.plain || first?.text || ''
      const hasChords = Array.isArray(first?.chordPositions) && first.chordPositions.length > 0
      if (!hasChords && isSectionLabel(txt)) {
        return { section: txt.trim(), lines: b.lines.slice(1) }
      }
    }
    return b
  })

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

  // Heights
  const lineHeight = (ln) => (ln?.chordPositions?.length ? (o.chordSizePt + lineGap / 2) : 0) + o.lyricSizePt + lineGap

  const pushSection = (col, header) => {
    col.blocks.push({ type: 'section', header })
  }
  const pushLine = (col, lyrics, cps) => {
    col.blocks.push({ type: 'line', lyrics, chords: cps.map(c => ({ x: measureLyric(lyrics.slice(0, c.index || 0)), sym: c.sym })) })
  }

  for (const block of (song.lyricsBlocks || [])) {
    const blockH = measureBlockHeight(block)
    if (cursorY + blockH <= contentBottomY) {
      const col = curCol()
      if (block.section) { cursorY += sectionTopPad; pushSection(col, block.section); cursorY += sectionSize + 4 }
      for (const ln of (block.lines || [])) {
        const plain = ln.plain || ln.text || ''
        const cps = ln.chordPositions || []
        pushLine(col, plain, cps)
        cursorY += lineHeight(ln)
      }
      cursorY += 4
      continue
    }

    // Oversized section → split at line boundaries with widow/orphan checks
    const lineHs = (block.lines || []).map(lineHeight)
    let i = 0
    while (i < (block.lines || []).length) {
      const remaining = (block.lines || []).length - i

      const minHead = (i === 0 && block.section) ? (sectionTopPad + sectionSize + 4) : 0
      const firstLineH = lineHs[i] || 0
      if (cursorY + minHead + firstLineH > contentBottomY) { advanceColOrPage(); continue }

      const avail = contentBottomY - cursorY - minHead
      let fit = 0, used = 0
      while (i + fit < lineHs.length && used + lineHs[i + fit] <= avail) {
        used += lineHs[i + fit]
        fit++
      }

      if (fit === 1 && remaining > 1) { advanceColOrPage(); continue }

      if (remaining - fit === 1) {
        if (fit > 1) {
          used -= lineHs[i + fit - 1]
          fit--
        } else {
          advanceColOrPage(); continue
        }
      }

      const col = curCol()
      if (i === 0 && block.section) { cursorY += sectionTopPad; pushSection(col, block.section); cursorY += sectionSize + 4 }

      for (let j = 0; j < fit; j++) {
        const ln = block.lines[i]
        const plain = ln.plain || ln.text || ''
        const cps = ln.chordPositions || []
        pushLine(col, plain, cps)
        cursorY += lineHs[i]
        i++
      }
      cursorY += 4
      if (i < (block.lines || []).length) advanceColOrPage()
    }
  }
  return { pages }
}

/* -----------------------------------------------------------
 * TEST HELPERS (sync; no jsPDF)
 * --------------------------------------------------------- */
export function getLayoutMetrics(input, opts) {
  const o = { ...DEFAULT_LAYOUT_OPT, ...opts }
  o.pageWidth = 612
  o.pageHeight = 792
  const measure = (text) => (text ? text.length * (o.lyricSizePt * 0.6) : 0)
  const layout = planSongLayout(normalizeSongInput(input), o, measure)
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

// Test-only: pure planner with deterministic measurers (no jsPDF)
export function planForTest(input, opts) {
  const song = normalizeSongInput(input)
  const o = { ...DEFAULT_LAYOUT_OPT, ...opts }
  o.pageWidth = 612; o.pageHeight = 792

  const makeMeasureLyricAt = (pt) => (text) => (text ? text.length * (pt * 0.6) : 0)
  const makeMeasureChordAt = (pt) => (text) => (text ? text.length * (pt * 0.6) : 0)

  const { plan } = chooseBestLayout(song, o, makeMeasureLyricAt, makeMeasureChordAt)
  return {
    columns: plan.columns,
    size: plan.lyricSizePt,
    pages: plan.layout.pages.length
  }
}

