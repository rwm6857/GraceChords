// src/utils/pdf/pdfLayout.js
// Pure layout planning helpers shared by PDF and image exporters.

import { resolveChordCollisions } from './measure'
import { parseChordProOrLegacy } from '../chordpro/parser'

// Normalize various song input shapes into { meta, sections }
export function normalizeSongInput(input) {
  if (!input) return { meta: { title: 'Untitled', key: 'C' }, sections: [] }

  // Already normalized SongDoc
  if (input.meta && Array.isArray(input.sections)) {
    const meta = {
      title: input.meta.title || input.title || 'Untitled',
      key: input.meta.key || input.key || 'C',
      capo: input.meta.capo,
      meta: input.meta.meta,
    }
    const sections = (input.sections || []).map(sec => ({
      kind: sec.kind || 'verse',
      label: sec.label,
      lines: (sec.lines || []).map(ln => ({
        lyrics: ln.comment ? ln.comment : (ln.lyrics || ln.plain || ln.text || ''),
        chords: (ln.chords || ln.chordPositions || []).map(c => ({ index: c.index || 0, sym: c.sym })),
        comment: ln.comment
      }))
    }))
    return { meta, sections, layoutHints: input.layoutHints }
  }

  // Legacy lyricsBlocks shape
  if (input.lyricsBlocks) {
    const sections = (input.lyricsBlocks || []).map(b => ({
      kind: 'verse',
      label: b.section,
      lines: (b.lines || []).map(ln => ({
        lyrics: ln.comment ? ln.comment : (ln.plain || ln.text || ''),
        chords: (ln.chordPositions || []).map(c => ({ index: c.index || 0, sym: c.sym })),
        comment: ln.comment
      }))
    }))
    return {
      meta: {
        title: input.title || 'Untitled',
        key: input.key || input.originalKey || 'C',
        capo: input.capo
      },
      sections
    }
  }

  // Legacy blocks
  if (Array.isArray(input?.blocks)) {
    const sections = []
    let cur = { kind: 'verse', label: '', lines: [] }
    for (const b of input.blocks) {
      if (b.type === 'section') {
        if (cur.lines.length) sections.push(cur)
        cur = { kind: 'verse', label: b.header, lines: [] }
      } else if (b.type === 'line') {
        cur.lines.push({
          lyrics: b.lyrics || b.text || '',
          chords: (b.chords || []).map(c => ({ index: c.index || 0, sym: c.sym }))
        })
      }
    }
    if (cur.lines.length) sections.push(cur)
    return {
      meta: {
        title: input.title || 'Untitled',
        key: input.key || input.originalKey || 'C'
      },
      sections
    }
  }

  if (typeof input === 'string') {
    return parseChordProOrLegacy(input)
  }

  if (input?.body || input?.lines) {
    const text = (input.body || (Array.isArray(input.lines) ? input.lines.join('\n') : '')) + ''
    return parseChordProOrLegacy(text)
  }

  return {
    meta: { title: input.title || 'Untitled', key: input.key || input.originalKey || 'C' },
    sections: []
  }
}

// Default layout options used by the planner
export const DEFAULT_LAYOUT_OPT = {
  lyricSizePt: 16,
  chordSizePt: 16,
  margin: 36,
  gutter: 24,
  headerOffsetY: 40,
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

  for (const sec of (song.sections || [])) {
    for (const ln of (sec.lines || [])) {
      const plain = ln.lyrics || ''
      if (measureLyric(plain) > limit) return true
      for (const c of (ln.chords || [])) {
        const x = measureLyric(plain.slice(0, c.index || 0))
        const cw = measureChord(c.sym || '')
        if (x + cw > limit) return true
      }
    }
  }
  return false
}

// Runtime trace toggle: localStorage.setItem('pdfPlanTrace','1')
const PDF_TRACE = typeof window !== 'undefined'
  && (() => { try { return localStorage.getItem('pdfPlanTrace') === '1' } catch { return false } })()

// Packing helper: place whole sections into columns without splitting
export function packIntoColumns(sections, cols, colHeight, { honorColumnBreaks } = {}) {
  const placed = Array.from({ length: cols }, () => [])
  const colHeights = Array(cols).fill(0)
  let colIdx = 0

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    const h = sec.h
    const tightH = sec.hNoPad
    if (h > colHeight) {
      return {
        singlePage: false,
        colHeights,
        occupancy: colHeights.map(hh => hh / colHeight),
        balance: cols === 2 ? 0 : 1,
        placed,
        reasonRejected: `section ${i} height ${h}pt > column ${colHeight}pt`
      }
    }

    if (honorColumnBreaks && sec.breakBefore && colIdx < cols - 1 && colHeights[colIdx] > 0) {
      if (h <= colHeight) colIdx++
    }

    let avail = colHeight - colHeights[colIdx]
    if (h <= avail) {
      placed[colIdx].push(i)
      colHeights[colIdx] += h
    } else if (tightH <= avail) {
      placed[colIdx].push(i)
      colHeights[colIdx] += tightH
      colIdx++
      if (colIdx >= cols && i < sections.length - 1) {
        return {
          singlePage: false,
          colHeights,
          occupancy: colHeights.map(hh => hh / colHeight),
          balance: cols === 2 ? 1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight : 1,
          placed,
          reasonRejected: `section ${i + 1} needs ${h}pt > remaining ${avail}pt in col ${cols}`
        }
      }
    } else {
      colIdx++
      if (colIdx >= cols) {
        return {
          singlePage: false,
          colHeights,
          occupancy: colHeights.map(hh => hh / colHeight),
          balance: cols === 2 ? 1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight : 1,
          placed,
          reasonRejected: `section ${i} needs ${h}pt > remaining ${avail}pt in col ${colIdx}`
        }
      }
      i-- // retry this section in next column
      continue
    }

    if (colIdx >= cols) break
  }

  const occupancy = colHeights.map(hh => hh / colHeight)
  const balance = cols === 2 ? 1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight : 1
  return { singlePage: true, colHeights, occupancy, balance, placed }
}

/**
 * Choose best layout using section packing and scoring.
 * Public API: signature must remain stable.
 */
export function chooseBestLayout(songIn, baseOpt = {}, makeMeasureLyricAt = () => () => 0, makeMeasureChordAt = () => () => 0) {
  const song = normalizeSongInput(songIn)
  const oBase = { ...DEFAULT_LAYOUT_OPT, ...baseOpt, gutter: DEFAULT_LAYOUT_OPT.gutter }
  const SIZE_STEPS = [16, 15, 14, 13, 12]
  const prefer2 = song.layoutHints?.requestedColumns === 2

  const contentH = oBase.pageHeight - (oBase.margin + oBase.headerOffsetY) - oBase.margin
  const secHeightsCache = {}
  const breakAfter = song.layoutHints?.columnBreakAfter || []

  const sectionHeightsAt = (pt) => {
    if (secHeightsCache[pt]) return secHeightsCache[pt]
    const lineGap = 4
    const secTopPad = Math.round(pt * 0.85)
    const commentSize = Math.max(10, pt - 2)
    const arr = (song.sections || []).map((sec, idx) => {
      let h = secTopPad + pt
      for (const ln of (sec.lines || [])) {
        if (ln.comment) {
          h += commentSize + 3
        } else {
          if (ln?.chords?.length) h += pt + lineGap / 2
          h += pt + lineGap
        }
      }
      if (!sec.lines?.length) h += pt
      h += 4
      return { h, hNoPad: h - 4, breakBefore: breakAfter.includes(idx) }
    })
    secHeightsCache[pt] = arr
    if (PDF_TRACE) {
      console.log('sectionHeights pt', pt, arr.map(s => s.h))
    }
    return arr
  }

  const candidates = []

  for (const pt of SIZE_STEPS) {
    for (const cols of [1, 2]) {
      const sections = sectionHeightsAt(pt)
      const pack = packIntoColumns(sections, cols, contentH, { honorColumnBreaks: true })
      const widthOk = !widthOverflows(song, cols, pt, oBase, makeMeasureLyricAt, makeMeasureChordAt)
      let penalties = 0
      if (cols === 2 && Math.min(...pack.occupancy) < 0.18) penalties += 50
      if (pack.occupancy.some(o => o > 0.98)) penalties += 5
      if (prefer2 && cols === 2) penalties -= 3
      const score = (pt * 100) + (pack.balance * 10) - penalties - (cols === 2 ? 2 : 0)
      candidates.push({ pt, cols, singlePage: pack.singlePage && widthOk, colHeights: pack.colHeights, occupancy: pack.occupancy, balance: pack.balance, penalties, finalScore: score, reasonRejected: widthOk ? pack.reasonRejected : 'width overflow', placed: pack.placed })
    }
  }

  if (PDF_TRACE) {
    console.table(candidates.map(c => ({ pt: c.pt, cols: c.cols, singlePage: c.singlePage, colHeights: c.colHeights.map(n => Number(n.toFixed(1))), occupancy: c.occupancy.map(o => Number(o.toFixed(2))), balance: Number(c.balance.toFixed(2)), penalties: c.penalties, finalScore: Number(c.finalScore.toFixed(2)), reasonRejected: c.reasonRejected || '' })))
    console.log('contentH', contentH, 'gutter', oBase.gutter)
  }

  const viable = candidates.filter(c => c.singlePage)
  if (viable.length) {
    const winner = viable.sort((a, b) => b.finalScore - a.finalScore)[0]
    const occStr = winner.occupancy.map(o => o.toFixed(2)).join(',')
    const debugFooter = `Plan: ${winner.cols} col • ${winner.pt}pt • singlePage=yes • occ=[${occStr}] • bal=${winner.balance.toFixed(2)}`

    // Build legacy plan
    const margin = oBase.margin
    const contentW = oBase.pageWidth - margin * 2
    const colW = winner.cols === 2 ? (contentW - oBase.gutter) / 2 : contentW
    const measureLyric = makeMeasureLyricAt(winner.pt)
    const measureChord = makeMeasureChordAt(winner.pt)
    const buildCol = (x, secIdxs) => {
      const blocks = []
      for (const si of secIdxs) {
        const sec = song.sections[si]
        blocks.push({ type: 'section', header: sec.label || sec.kind })
        for (const ln of (sec.lines || [])) {
          if (ln.comment) {
            blocks.push({ type: 'line', comment: ln.comment })
          } else {
            const chords = (ln.chords || []).map(c => ({ x: measureLyric((ln.lyrics || '').slice(0, c.index || 0)), w: measureChord(c.sym || ''), sym: c.sym }))
            resolveChordCollisions(chords)
            blocks.push({ type: 'line', lyrics: ln.lyrics || '', chords })
          }
        }
      }
      return { x, blocks }
    }

    const columns = [buildCol(margin, winner.placed[0] || [])]
    if (winner.cols === 2) {
      columns.push(buildCol(margin + colW + oBase.gutter, winner.placed[1] || []))
    }
    const layout = { pages: [{ columns }] }

    const plan = {
      lyricFamily: oBase.lyricFamily,
      chordFamily: oBase.chordFamily,
      lyricSizePt: winner.pt,
      chordSizePt: winner.pt,
      columns: winner.cols,
      margin: oBase.margin,
      headerOffsetY: oBase.headerOffsetY,
      gutter: oBase.gutter,
      layout,
      debugFooter
    }
    return { plan }
  }

  // Fallback: legacy two-page @12pt
  const minSz = 12
  let layout = planSongLayout(
    song,
    { ...oBase, columns: 1, lyricSizePt: minSz, chordSizePt: minSz },
    makeMeasureLyricAt(minSz),
    makeMeasureChordAt(minSz)
  )
  let plan = { ...oBase, columns: 1, lyricSizePt: minSz, chordSizePt: minSz, layout }
  if (!fitsWithinTwoPages(plan)) {
    layout = planSongLayout(
      song,
      { ...oBase, columns: 2, lyricSizePt: minSz, chordSizePt: minSz },
      makeMeasureLyricAt(minSz),
      makeMeasureChordAt(minSz)
    )
    plan = { ...oBase, columns: 2, lyricSizePt: minSz, chordSizePt: minSz, layout }
  }
  plan.debugFooter = `Plan: ${plan.columns} col • ${plan.lyricSizePt}pt • singlePage=${plan.layout.pages.length === 1 ? 'yes' : 'no'}`
  return { plan }
}

function fitsWithinTwoPages(plan) {
  return (plan?.layout?.pages?.length || 99) <= 2
}

// Public layout function (was computeLayout). Pure; does not select sizes/columns.
export function planSongLayout(songIn, opt = {}, measureLyric = (t) => 0, measureChord = (t) => 0) {
  const song = normalizeSongInput(songIn)
  const o = { ...DEFAULT_LAYOUT_OPT, ...opt, gutter: DEFAULT_LAYOUT_OPT.gutter }
  const lineGap = 4
  const sectionSize = o.lyricSizePt
  const sectionTopPad = Math.round(o.lyricSizePt * 0.85)
  const commentSize = Math.max(10, o.lyricSizePt - 2)

  const margin = o.margin
  const pageH = o.pageHeight
  const contentW = o.pageWidth - margin * 2
  const colW = o.columns === 2 ? (contentW - o.gutter) / 2 : contentW

  const contentStartY = margin + o.headerOffsetY
  const contentBottomY = pageH - margin
  const maxBlockH = contentBottomY - contentStartY

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

  const measureSectionHeight = (sec) => {
    let h = sectionTopPad + sectionSize + 4
    for (const ln of (sec.lines || [])) {
      if (ln.comment) {
        h += commentSize + 3
      } else {
        if (ln?.chords?.length) h += o.chordSizePt + lineGap / 2
        h += o.lyricSizePt + lineGap
      }
    }
    return h + 4
  }

  const lineHeight = (ln) => {
    if (ln.comment) return commentSize + 3
    return (ln?.chords?.length ? (o.chordSizePt + lineGap / 2) : 0) + o.lyricSizePt + lineGap
  }

  const pushSection = (col, header) => { col.blocks.push({ type: 'section', header }) }
  const pushLine = (col, lyrics, cps, comment) => {
    if (comment) {
      col.blocks.push({ type: 'line', comment })
      return
    }
    const chords = cps.map(c => ({
      x: measureLyric(lyrics.slice(0, c.index || 0)),
      w: measureChord(c.sym || ''),
      sym: c.sym
    }))
    resolveChordCollisions(chords)
    col.blocks.push({ type: 'line', lyrics, chords })
  }

  for (let i = 0; i < (song.sections || []).length; i++) {
    const sec = song.sections[i]
    const blockH = measureSectionHeight(sec)
    if (song.layoutHints?.columnBreakAfter?.includes(i) && blockH <= maxBlockH && cursorY !== contentStartY) {
      advanceColOrPage()
    } else if (blockH > maxBlockH) {
      if (cursorY !== contentStartY || (o.columns === 2 && colIdx === 1)) advanceColOrPage()
    } else if (cursorY + blockH > contentBottomY) {
      advanceColOrPage()
    }

    const col = curCol()
    cursorY += sectionTopPad
    pushSection(col, sec.label || sec.kind)
    cursorY += sectionSize + 4
    for (const ln of (sec.lines || [])) {
      pushLine(col, ln.lyrics || '', ln.chords || [], ln.comment)
      cursorY += lineHeight(ln)
    }
    cursorY += 4
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
  const layout = planSongLayout(normalizeSongInput(input), o, measure, measure)
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

