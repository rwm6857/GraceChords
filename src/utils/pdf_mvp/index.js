// Minimal, reliable PDF exporter (MVP) focused on single-song export.
// Implements the decision ladder described by the product notes:
// 1) Try 1 column at 15→11pt, single page.
// 2) If not, try 2 columns at 15→11pt, single page.
// 3) Worst case, 1 column @15pt across multiple pages.
//
// Constraints honored:
// - Sections are atomic: never split across columns or pages.
// - Title and "Key of …" on first page only.
// - Chords on a separate line above wrapped lyric line; no overlap (min 1 space).
// - Fonts: Noto Sans family preferred; fall back to jsPDF built-ins.

import jsPDF from 'jspdf'
import { registerPdfFonts } from '../pdf2/fonts.js'

const PAGE = { w: 612, h: 792 } // Letter
const MARGINS = { top: 36, right: 36, bottom: 36, left: 36 } // 0.5 inch
const GUTTER = 24
const TITLE_PT = 26
const SUBTITLE_PT = 16
const SIZE_WINDOW = [16, 15, 14, 13, 12]
const TITLE_LINE_FACTOR = 1.04
const SUBTITLE_LINE_FACTOR = 1.0
const LINE_HEIGHT_FACTOR = 1.2
const CHORD_ABOVE_GAP = 0.75
const SECTION_SPACER_PT = 8
const TITLE_TO_KEY_FACTOR = 0.85 // tighter gap between last title line and key
const KEY_TO_SECTION_LINES = 1.125 // slightly over one line; tighter than before

function createDoc(){
  const JsPDFCtor = (typeof window !== 'undefined' && window.jsPDF) || jsPDF
  return new JsPDFCtor({ unit: 'pt', format: [PAGE.w, PAGE.h] })
}

async function ensureFonts(doc){
  await registerPdfFonts(doc)
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  try { doc.setTextColor(0,0,0) } catch {}
}

function usableWidth(){
  return PAGE.w - MARGINS.left - MARGINS.right
}

function colWidth(columns){
  const w = usableWidth()
  return columns === 2 ? (w - GUTTER) / 2 : w
}

function headerHeightFor(doc, songTitle, songKey){
  const w = usableWidth()
  let titleLines = []
  try { titleLines = doc.splitTextToSize(String(songTitle || ''), w) } catch { titleLines = [String(songTitle || '')] }
  const n = Array.isArray(titleLines) ? titleLines.length : 1
  // First title line takes TITLE_PT; additional lines add TITLE_LINE_FACTOR increments
  const titleStack = TITLE_PT + (Math.max(0, n - 1)) * (TITLE_PT * TITLE_LINE_FACTOR)
  const gapTitleToKey = songKey ? TITLE_PT * TITLE_TO_KEY_FACTOR : 0
  const keyStack = songKey ? SUBTITLE_PT * SUBTITLE_LINE_FACTOR : 0
  return Math.ceil(titleStack + gapTitleToKey + keyStack)
}

function headerOffsetFor(doc, songTitle, songKey, bodyPt){
  // Total header + clear space before first section header
  return headerHeightFor(doc, songTitle, songKey) + Math.ceil(bodyPt * LINE_HEIGHT_FACTOR * KEY_TO_SECTION_LINES)
}

function sectionify(song){
  // Accept either lyricsBlocks or sections (normalized)
  const blocks = Array.isArray(song?.lyricsBlocks)
    ? song.lyricsBlocks.map(b => ({
        label: b.section || '',
        lines: (b.lines || []).map(ln => ({
          plain: ln.plain ?? ln.lyrics ?? '',
          chords: (ln.chordPositions ?? ln.chords ?? []).map(c => ({ sym: String(c.sym || ''), index: Math.max(0, c.index|0) })),
          comment: ln.comment
        }))
      }))
    : Array.isArray(song?.sections)
      ? song.sections.map(s => ({
          label: s.label || s.kind || '',
          lines: (s.lines || []).map(ln => ({
            plain: ln.plain ?? ln.lyrics ?? '',
            chords: (ln.chordPositions ?? ln.chords ?? []).map(c => ({ sym: String(c.sym || ''), index: Math.max(0, c.index|0) })),
            comment: ln.comment
          }))
        }))
      : []
  return blocks
}

function splitLyricWithChords(doc, text, chords, width){
  let parts = []
  try { parts = doc.splitTextToSize(String(text || ''), width) } catch { parts = [String(text || '')] }
  const lines = []
  let consumed = 0
  for(let i=0; i<parts.length; i++){
    const p = parts[i]
    const isLast = i === parts.length - 1
    const start = consumed
    const end = start + p.length
    const lineChords = (chords || []).filter(c => c.index >= start && (c.index < end || (isLast && c.index === end)))
    lines.push({ lyric: p, chords: lineChords, start })
    consumed += p.length
  }
  return lines
}

function measureSectionHeight(doc, section, width, bodyPt){
  let h = 0
  const lineH = bodyPt * LINE_HEIGHT_FACTOR
  if (section.label) {
    h += lineH // section header consumes one line height
  }
  for(const ln of section.lines || []){
    if (ln.comment) {
      h += lineH // comments render as a single line (italic), no chords
      continue
    }
    const rows = splitLyricWithChords(doc, ln.plain || '', ln.chords || [], width)
    for(const row of rows){
      if ((row.chords || []).length) h += lineH * CHORD_ABOVE_GAP // tighter chord-to-lyric gap
      h += lineH // lyric row
    }
  }
  // spacer between sections
  h += SECTION_SPACER_PT
  return { height: h, lineH }
}

function canPackOnePage(doc, sections, columns, bodyPt, songTitle, songKey){
  const width = colWidth(columns)
  const availH = PAGE.h - MARGINS.top - MARGINS.bottom - headerOffsetFor(doc, songTitle, songKey, bodyPt)
  const heights = sections.map(s => measureSectionHeight(doc, s, width, bodyPt))
  if (columns === 1){
    const total = heights.reduce((n, x) => n + x.height, 0)
    return total <= availH
  }
  // Greedy: fill first col, then second; no section splits
  let left = availH, right = availH
  for(const { height } of heights){
    if (height <= left){ left -= height; continue }
    if (height <= right){ right -= height; continue }
    return false
  }
  return true
}

function planOnePage(doc, sections, columns, bodyPt, songTitle, songKey){
  const width = colWidth(columns)
  const availH = PAGE.h - MARGINS.top - MARGINS.bottom - headerOffsetFor(doc, songTitle, songKey, bodyPt)
  const plan = { columns, fontPt: bodyPt, pages: [{ columns: columns === 2 ? [[], []] : [[]] }], lineH: bodyPt * LINE_HEIGHT_FACTOR }
  const cols = plan.pages[0].columns
  if (columns === 1){
    let rem = availH
    for (let i = 0; i < sections.length; i++){
      const { height } = measureSectionHeight(doc, sections[i], width, bodyPt)
      if (height > rem) return null
      cols[0].push(i)
      rem -= height
    }
    return plan
  }
  // Two-column greedy: try left; if not, try right. Mirrors canPackOnePage().
  let remL = availH, remR = availH
  for (let i = 0; i < sections.length; i++){
    const { height } = measureSectionHeight(doc, sections[i], width, bodyPt)
    if (height <= remL){
      cols[0].push(i)
      remL -= height
      continue
    }
    if (height <= remR){
      cols[1].push(i)
      remR -= height
      continue
    }
    // cannot fit per the greedy test
    return null
  }
  return plan
}

function planMultiPage(doc, sections, bodyPt, songTitle, songKey){
  // 1 column, 15pt, page-break between sections as needed
  const columns = 1
  const width = colWidth(columns)
  const availHFirst = PAGE.h - MARGINS.top - MARGINS.bottom - headerOffsetFor(doc, songTitle, songKey, bodyPt)
  const availHNext = PAGE.h - MARGINS.top - MARGINS.bottom
  const plan = { columns, fontPt: bodyPt, pages: [], lineH: bodyPt*LINE_HEIGHT_FACTOR }
  let remaining = availHFirst
  let page = { columns: [[]] }
  plan.pages.push(page)
  for(let i=0;i<sections.length;i++){
    const { height } = measureSectionHeight(doc, sections[i], width, bodyPt)
    if (height <= remaining){
      page.columns[0].push(i)
      remaining -= height
    } else {
      // next page
      page = { columns: [[]] }
      plan.pages.push(page)
      remaining = availHNext
      page.columns[0].push(i)
      remaining -= height
    }
  }
  return plan
}

function drawTextSafe(doc, text, x, y){
  try { doc.text(text, x, y) } catch {}
}

function drawTitle(doc, songTitle, songKey){
  // Title
  try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
  doc.setFontSize(TITLE_PT)
  const w = usableWidth()
  let lines = []
  try { lines = doc.splitTextToSize(String(songTitle || ''), w) } catch { lines = [String(songTitle || '')] }
  const arr = Array.isArray(lines) ? lines : [lines]
  const y0 = MARGINS.top + TITLE_PT
  // Draw wrapped title lines using fixed increments
  for(let i = 0; i < arr.length; i++){
    const y = y0 + i * (TITLE_PT * TITLE_LINE_FACTOR)
    drawTextSafe(doc, arr[i], MARGINS.left, y)
  }

  // Subtitle
  try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
  doc.setFontSize(SUBTITLE_PT)
  if (songKey) {
    // Draw key in a subtle gray to contrast with the title
    try { doc.setTextColor(90, 90, 90) } catch {}
    const yKey = y0 + (Math.max(0, arr.length - 1)) * (TITLE_PT * TITLE_LINE_FACTOR) + (TITLE_PT * TITLE_TO_KEY_FACTOR)
    drawTextSafe(doc, `Key of ${songKey}`, MARGINS.left, yKey)
    const yAfterKey = yKey + SUBTITLE_PT * SUBTITLE_LINE_FACTOR
    // Restore text color to black
    try { doc.setTextColor(0, 0, 0) } catch {}
    // Reset body font and return bottom position of the header
    try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
    return yAfterKey
  }

  // Reset body font
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  // If no key, return bottom of title stack
  return y0 + (Math.max(0, arr.length - 1)) * (TITLE_PT * TITLE_LINE_FACTOR)
}

function renderSection(doc, section, x, y, width, lineH){
  let cursorY = y
  const bodyPt = Math.round(lineH / LINE_HEIGHT_FACTOR)
  doc.setFontSize(bodyPt)
  if (section.label){
    try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
    // Header same size as lyrics
    doc.setFontSize(bodyPt)
    drawTextSafe(doc, `[${String(section.label).toUpperCase()}]`, x, cursorY)
    cursorY += lineH // keep header spacing consistent with lyric lines
    try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  }

  doc.setFontSize(bodyPt)

  for(const ln of section.lines || []){
    if (ln.comment){
      // render italic comment
      try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
      drawTextSafe(doc, ln.plain || '', x, cursorY)
      try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
      cursorY += lineH
      continue
    }
    // If a line looks like a section label (no chords and label-ish text), render as header for consistency
    const raw = String(ln.plain || '').trim()
    const hasChords = Array.isArray(ln.chords) && ln.chords.length > 0
    if (!hasChords && isHeaderLike(raw)){
      try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
      doc.setFontSize(bodyPt)
      drawTextSafe(doc, `[${raw.toUpperCase()}]`, x, cursorY)
      cursorY += lineH
      try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
      continue
    }
    const rows = splitLyricWithChords(doc, ln.plain || '', ln.chords || [], width)
    for(const row of rows){
      if ((row.chords || []).length){
        // Measure lyric substring widths in lyric font to match wrapping
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
        doc.setFontSize(bodyPt)
        let lastX = -Infinity
        // Measure minimal chord separation using chord font
        let spaceW = 0.01
        try { doc.setFont('NotoSansMono', 'bold'); spaceW = Math.max(0.01, doc.getTextWidth(' ')) } catch {}
        // Restore lyric font for measuring lyric substrings
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
        doc.setFontSize(bodyPt)
        for(const c of row.chords){
          const offsetInLine = Math.min(Math.max(0, c.index - (row.start || 0)), row.lyric.length)
          const pre = row.lyric.slice(0, offsetInLine)
          let chordX = x
          try { chordX = x + doc.getTextWidth(pre) } catch {}
          if (chordX < lastX + spaceW) chordX = lastX + spaceW
          // Draw chord in mono bold at computed position
          try { doc.setFont('NotoSansMono', 'bold') } catch { try { doc.setFont('courier', 'bold') } catch {} }
          drawTextSafe(doc, String(c.sym), chordX, cursorY)
          try { lastX = chordX + Math.max(spaceW, doc.getTextWidth(String(c.sym))) } catch { lastX = chordX + spaceW }
          // Switch back to lyric font for measuring next chord offset
          try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
          doc.setFontSize(bodyPt)
        }
        // tighter gap between chords and lyric
        cursorY += lineH * CHORD_ABOVE_GAP
      }

      drawTextSafe(doc, row.lyric, x, cursorY)
      cursorY += lineH
    }
  }

  // spacer between sections
  return cursorY + SECTION_SPACER_PT
}

function isHeaderLike(text=''){
  const s = String(text).trim()
  return /^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i.test(s)
}

function renderPlanned(doc, plan, sections, song){
  const songTitle = song?.title || 'Untitled'
  const songKey = song?.key || song?.originalKey || ''
  const cols = plan.columns
  const width = colWidth(cols)
  const lineH = plan.lineH
  // first page
  drawTitle(doc, songTitle, songKey)
  for(let p=0; p<plan.pages.length; p++){
    if (p>0) doc.addPage([PAGE.w, PAGE.h])
    const bodyPt = plan.fontPt || Math.round(lineH / LINE_HEIGHT_FACTOR)
    const headerOffset = (p===0) ? headerOffsetFor(doc, songTitle, songKey, bodyPt) : 0
    const x0 = MARGINS.left
    const x1 = MARGINS.left + width + (cols===2 ? GUTTER : 0)
    let y0 = MARGINS.top + headerOffset
    let y1 = MARGINS.top + headerOffset
    const colIdxs = plan.pages[p].columns
    for(const idx of colIdxs[0]){
      y0 = renderSection(doc, sections[idx], x0, y0, width, lineH)
    }
    if (cols === 2){
      for(const idx of colIdxs[1]){
        y1 = renderSection(doc, sections[idx], x1, y1, width, lineH)
      }
    }
  }
}

function triggerDownload(blob, filename){
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function downloadSingleSongPdf(song){
  // Build sections
  const sections = sectionify(song)
  const doc = createDoc()
  await ensureFonts(doc)
  const songTitle = song?.title || 'Untitled'
  const songKey = song?.key || song?.originalKey || ''

  // Decision ladder
  // 1) 1-col @15→11pt
  for(const pt of SIZE_WINDOW){
    doc.setFontSize(pt)
    if (canPackOnePage(doc, sections, 1, pt, songTitle, songKey)){
      const plan = planOnePage(doc, sections, 1, pt, songTitle, songKey)
      renderPlanned(doc, plan, sections, song)
      const blob = doc.output('blob')
      triggerDownload(blob, `${String(song?.title || 'song').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`)
      return { plan }
    }
  }
  // 2) 2-col @15→11pt
  for(const pt of SIZE_WINDOW){
    doc.setFontSize(pt)
    if (canPackOnePage(doc, sections, 2, pt, songTitle, songKey)){
      const plan = planOnePage(doc, sections, 2, pt, songTitle, songKey)
      renderPlanned(doc, plan, sections, song)
      const blob = doc.output('blob')
      triggerDownload(blob, `${String(song?.title || 'song').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`)
      return { plan }
    }
  }
  // 3) Fallback: multi-page 1-col @15pt
  const pt = 15
  doc.setFontSize(pt)
  const plan = planMultiPage(doc, sections, pt, songTitle, songKey)
  renderPlanned(doc, plan, sections, song)
  const blob = doc.output('blob')
  triggerDownload(blob, `${String(song?.title || 'song').replace(/[\\/:*?"<>|]+/g, '_')}.pdf`)
  return { plan }
}

// Test helper: plan only (no rendering or download). Returns both the raw plan
// and a summary { columns, size, pages } for easy assertions.
export async function planSingleSong(song){
  const sections = sectionify(song)
  const doc = createDoc()
  const songTitle = song?.title || 'Untitled'
  const songKey = song?.key || song?.originalKey || ''

  for(const pt of SIZE_WINDOW){
    doc.setFontSize(pt)
    if (canPackOnePage(doc, sections, 1, pt, songTitle, songKey)){
      const plan = planOnePage(doc, sections, 1, pt, songTitle, songKey)
      return { plan, summary: { columns: plan.columns, size: plan.fontPt, pages: plan.pages.length } }
    }
  }
  for(const pt of SIZE_WINDOW){
    doc.setFontSize(pt)
    if (canPackOnePage(doc, sections, 2, pt, songTitle, songKey)){
      const plan = planOnePage(doc, sections, 2, pt, songTitle, songKey)
      return { plan, summary: { columns: plan.columns, size: plan.fontPt, pages: plan.pages.length } }
    }
  }
  const pt = 15
  doc.setFontSize(pt)
  const plan = planMultiPage(doc, sections, pt, songTitle, songKey)
  return { plan, summary: { columns: plan.columns, size: plan.fontPt, pages: plan.pages.length } }
}

// ---------------------- Test-only helpers (non-rendering) -------------------
function computeChordXsInternal({ text, chords, width, pt }){
  const doc = createDoc()
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  doc.setFontSize(pt)
  const rows = splitLyricWithChords(doc, String(text||''), chords || [], width)
  const row = rows[0] || { lyric: '', chords: [], start: 0 }
  // Minimal spacing measured in chord font
  let spaceW = 0.01
  try { doc.setFont('NotoSansMono', 'bold'); spaceW = Math.max(0.01, doc.getTextWidth(' ')) } catch {}
  // Lyric font for measuring substrings
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  doc.setFontSize(pt)
  const xs = []
  let lastX = -Infinity
  for(const c of (row.chords || [])){
    const offset = Math.min(Math.max(0, (c.index|0) - (row.start || 0)), row.lyric.length)
    const pre = row.lyric.slice(0, offset)
    let x = 0
    try { x = doc.getTextWidth(pre) } catch { x = 0 }
    if (x < lastX + spaceW) x = lastX + spaceW
    xs.push(x)
    lastX = x
  }
  let lyricWidth = 0
  try { lyricWidth = doc.getTextWidth(row.lyric || '') } catch { lyricWidth = 0 }
  return { xs, lyricWidth, spaceW }
}

export const __test = {
  computeChordXs: computeChordXsInternal,
  headerHeights: (title, key, bodyPt) => {
    const doc = createDoc()
    const h = headerHeightFor(doc, title || '', key || '')
    const off = headerOffsetFor(doc, title || '', key || '', bodyPt || 16)
    return { height: h, offset: off }
  }
}

// ---------------------------------------------------------------------------
// Multi-song (Setlist) and Songbook exports

async function planForSong(song){
  // Reuse the decision ladder used by downloadSingleSongPdf(), but only return plan
  const sections = sectionify(song)
  const doc = createDoc()
  const songTitle = song?.title || 'Untitled'
  const songKey = song?.key || song?.originalKey || ''
  for(const pt of SIZE_WINDOW){
    doc.setFontSize(pt)
    if (canPackOnePage(doc, sections, 1, pt, songTitle, songKey)){
      return planOnePage(doc, sections, 1, pt, songTitle, songKey)
    }
  }
  for(const pt of SIZE_WINDOW){
    doc.setFontSize(pt)
    if (canPackOnePage(doc, sections, 2, pt, songTitle, songKey)){
      return planOnePage(doc, sections, 2, pt, songTitle, songKey)
    }
  }
  // fallback: 1-col multi-page at 15
  const pt = 15
  doc.setFontSize(pt)
  return planMultiPage(doc, sections, pt, songTitle, songKey)
}

export async function downloadMultiSongPdf(songs = []){
  if (!Array.isArray(songs) || songs.length === 0) return
  const doc = createDoc()
  await ensureFonts(doc)

  for (let i = 0; i < songs.length; i++){
    const song = songs[i]
    const plan = await planForSong(song)
    const sections = sectionify(song)
    if (i > 0) doc.addPage([PAGE.w, PAGE.h])
    renderPlanned(doc, plan, sections, song)
  }

  const blob = doc.output('blob')
  triggerDownload(blob, `setlist-${new Date().toISOString().slice(0,10)}.pdf`)
}

export async function downloadSongbookPdf(songs = [], { includeTOC = true, coverImageDataUrl = null } = {}){
  if (!Array.isArray(songs) || songs.length === 0) return
  const doc = createDoc()
  await ensureFonts(doc)

  // Pre-plan to compute TOC page numbers
  const pre = []
  for (const s of songs){
    const plan = await planForSong(s)
    pre.push({ song: s, plan, sections: sectionify(s) })
  }

  let pageNo = 1
  // Cover page
  if (coverImageDataUrl){
    try {
      // Fit image centered while preserving aspect ratio
      const availW = PAGE.w - MARGINS.left - MARGINS.right
      const availH = PAGE.h - MARGINS.top - MARGINS.bottom
      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = coverImageDataUrl
      })
      const scale = Math.min(availW / img.width, availH / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = MARGINS.left + (availW - w) / 2
      const y = MARGINS.top + (availH - h) / 2
      doc.addImage(coverImageDataUrl, undefined, x, y, w, h, undefined, 'FAST')
    } catch {
      // If image fails, fall back to default cover rendering below
      try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
      doc.setFontSize(TITLE_PT)
      try { doc.text('GraceChords Songbook', PAGE.w/2, PAGE.h/2 - 10, { align: 'center', baseline: 'middle' }) } catch {}
      try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
      doc.setFontSize(SUBTITLE_PT)
      try { doc.setTextColor(90,90,90) } catch {}
      const dateStr = new Date().toISOString().slice(0,10)
      try { doc.text(dateStr, PAGE.w/2, PAGE.h/2 + 14, { align: 'center', baseline: 'middle' }) } catch {}
      try { doc.setTextColor(0,0,0) } catch {}
    }
    pageNo++
  } else {
    // Default cover: centered title + date subtitle (matching song page scheme)
    try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
    doc.setFontSize(TITLE_PT)
    try { doc.text('GraceChords Songbook', PAGE.w/2, PAGE.h/2 - 10, { align: 'center', baseline: 'middle' }) } catch {}
    try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
    doc.setFontSize(SUBTITLE_PT)
    try { doc.setTextColor(90,90,90) } catch {}
    const dateStr = new Date().toISOString().slice(0,10)
    try { doc.text(dateStr, PAGE.w/2, PAGE.h/2 + 14, { align: 'center', baseline: 'middle' }) } catch {}
    try { doc.setTextColor(0,0,0) } catch {}
    pageNo++
  }

  // Compute TOC pagination (default 1-col; switch to 2-col to avoid a second page; if a second page is needed, continue with 2-col)
  const entries = pre.length
  const lineH = 16
  const yStartFirst = MARGINS.top + 24
  const rowsPerColFirst = Math.max(1, Math.floor((PAGE.h - MARGINS.bottom - yStartFirst) / lineH))
  const rowsPerColNext  = Math.max(1, Math.floor((PAGE.h - MARGINS.bottom - MARGINS.top) / lineH))

  let tocPages = 0
  if (includeTOC) {
    if (entries <= rowsPerColFirst) tocPages = 1
    else if (entries <= 2 * rowsPerColFirst) tocPages = 1
    else {
      const remaining = Math.max(0, entries - 2 * rowsPerColFirst)
      const extraPages = Math.ceil(remaining / (2 * rowsPerColNext))
      tocPages = 1 + extraPages
    }
  }

  // TOC page
  if (includeTOC){
    const leftX = MARGINS.left
    const rightX = PAGE.w / 2 + 10

    // First TOC page
    doc.addPage([PAGE.w, PAGE.h])
    try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
    doc.setFontSize(18)
    drawTextSafe(doc, 'Table of Contents', MARGINS.left, MARGINS.top)
    try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
    doc.setFontSize(11)

    let idx = 0
    if (entries <= rowsPerColFirst) {
      // Single column fits on first page
      let y = yStartFirst
      while (idx < entries && y <= PAGE.h - MARGINS.bottom - lineH) {
        const title = String(pre[idx].song?.title || 'Untitled')
        drawTextSafe(doc, `${idx+1}. ${title}`, leftX, y)
        y += lineH
        idx++
      }
    } else {
      // Two columns on first page to avoid a second page if possible
      let yL = yStartFirst, yR = yStartFirst
      // Left column
      for (let c = 0; c < rowsPerColFirst && idx < entries; c++, idx++) {
        const title = String(pre[idx].song?.title || 'Untitled')
        drawTextSafe(doc, `${idx+1}. ${title}`, leftX, yL)
        yL += lineH
      }
      // Right column
      for (let c = 0; c < rowsPerColFirst && idx < entries; c++, idx++) {
        const title = String(pre[idx].song?.title || 'Untitled')
        drawTextSafe(doc, `${idx+1}. ${title}`, rightX, yR)
        yR += lineH
      }

      // Additional TOC pages (two columns)
      while (idx < entries) {
        doc.addPage([PAGE.w, PAGE.h])
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
        doc.setFontSize(11)
        let yL2 = MARGINS.top, yR2 = MARGINS.top
        for (let c = 0; c < rowsPerColNext && idx < entries; c++, idx++) {
          const title = String(pre[idx].song?.title || 'Untitled')
          drawTextSafe(doc, `${idx+1}. ${title}`, leftX, yL2)
          yL2 += lineH
        }
        for (let c = 0; c < rowsPerColNext && idx < entries; c++, idx++) {
          const title = String(pre[idx].song?.title || 'Untitled')
          drawTextSafe(doc, `${idx+1}. ${title}`, rightX, yR2)
          yR2 += lineH
        }
      }
    }
  }

  // Songs (each starts on a new page; first song follows TOC)
  for (let i = 0; i < pre.length; i++){
    doc.addPage([PAGE.w, PAGE.h])
    const numbered = { ...pre[i].song, title: `${i+1}. ${pre[i].song?.title || 'Untitled'}` }
    renderPlanned(doc, pre[i].plan, pre[i].sections, numbered)
  }

  const blob = doc.output('blob')
  triggerDownload(blob, `songbook-${new Date().toISOString().slice(0,10)}.pdf`)
}
