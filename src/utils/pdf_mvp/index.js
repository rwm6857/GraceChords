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
const TITLE_PT = 24
const SUBTITLE_PT = 16
const SIZE_WINDOW = [16, 15, 14, 13, 12, 11]
const TITLE_LINE_FACTOR = 1.04
const SUBTITLE_LINE_FACTOR = 1.0
const LINE_HEIGHT_FACTOR = 1.2
const CHORD_ABOVE_GAP = 0.75
const SECTION_SPACER_PT = 8

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
  const titleH = (Array.isArray(titleLines) ? titleLines.length : 1) * TITLE_PT * TITLE_LINE_FACTOR
  const subH = songKey ? SUBTITLE_PT * SUBTITLE_LINE_FACTOR : 0
  return Math.ceil(titleH + subH)
}

function headerOffsetFor(doc, songTitle, songKey, bodyPt){
  // Total header + generous gap (≈1.75 lines) before first section header
  const lines = 1.75
  return headerHeightFor(doc, songTitle, songKey) + Math.ceil(bodyPt * LINE_HEIGHT_FACTOR * lines)
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
  const plan = { columns, fontPt: bodyPt, pages: [{ columns: columns===2 ? [[],[]] : [[]] }], lineH: bodyPt*LINE_HEIGHT_FACTOR }
  const cols = plan.pages[0].columns
  let idx = 0
  let colIdx = 0
  let remaining = [availH, availH]
  while(idx < sections.length){
    const s = sections[idx]
    const { height } = measureSectionHeight(doc, s, width, bodyPt)
    if (height <= remaining[colIdx]){
      cols[colIdx].push(idx)
      remaining[colIdx] -= height
      idx++
    } else if (columns === 2 && colIdx === 0){
      // try second column
      colIdx = 1
    } else {
      // cannot fit
      return null
    }
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
  let y = MARGINS.top + TITLE_PT
  const arr = Array.isArray(lines) ? lines : [lines]
  for(const ln of arr){
    drawTextSafe(doc, ln, MARGINS.left, y)
    y += TITLE_PT * TITLE_LINE_FACTOR
  }

  // Subtitle
  try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
  doc.setFontSize(SUBTITLE_PT)
  if (songKey) {
    // Draw key in a slightly lighter gray to contrast with the title
    try { doc.setTextColor(120, 120, 120) } catch {}
    drawTextSafe(doc, `Key of ${songKey}`, MARGINS.left, y)
    y += SUBTITLE_PT * SUBTITLE_LINE_FACTOR
    // Restore text color to black
    try { doc.setTextColor(0, 0, 0) } catch {}
  }

  // Reset body font
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  return y
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
