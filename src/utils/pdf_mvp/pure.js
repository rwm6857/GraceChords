// DOM-free PDF renderer for songs and setlists.
// Same layout algorithm as ./index.js but returns Uint8Array buffers instead
// of triggering browser downloads, so this module is safe to import from
// Cloudflare Workers (e.g. workers/telegram-bot) and Node test runners.
//
// Decision ladder (matches the README):
// 1) Try 1 column at 16→12 pt, single page.
// 2) If not, try 2 columns at 16→12 pt, single page.
// 3) Fallback: 1 column at 15 pt across multiple pages.
//
// Constraints honored:
// - Sections are atomic: never split across columns or pages.
// - Title and "Key of …" on first page only.
// - Chords on a separate line above the wrapped lyric line; no overlap.
// - Fonts: Noto Sans family preferred; falls back to jsPDF built-ins.

import jsPDF from 'jspdf'
import { applyFooterToAllPages } from './footer'
import { formatInstrumental } from '../songs/instrumental.js'

const PAGE = { w: 612, h: 792 } // Letter
const MARGINS = { top: 36, right: 36, bottom: 36, left: 36 }
const GUTTER = 24
const TITLE_PT = 26
const SUBTITLE_PT = 16
const SIZE_WINDOW = [16, 15, 14, 13, 12]
const TITLE_LINE_FACTOR = 1.04
const SUBTITLE_LINE_FACTOR = 1.0
const LINE_HEIGHT_FACTOR = 1.2
const CHORD_ABOVE_GAP = 0.75
const SECTION_SPACER_PT = 8
const TITLE_TO_KEY_FACTOR = 0.85
const KEY_TO_SECTION_LINES = 1.125

export function createDoc(){
  const JsPDFCtor = (typeof window !== 'undefined' && window.jsPDF) || jsPDF
  return new JsPDFCtor({ unit: 'pt', format: [PAGE.w, PAGE.h] })
}

// Default fonts registrar is a no-op; callers pass their own (browser/Vite or
// worker/Data-binding). When omitted the renderer falls back to jsPDF
// built-ins (Helvetica/Courier), which is still legible but loses Noto.
async function applyFonts(doc, registerFonts){
  if (typeof registerFonts === 'function') {
    try { await registerFonts(doc) } catch {}
  }
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
  const titleStack = TITLE_PT + (Math.max(0, n - 1)) * (TITLE_PT * TITLE_LINE_FACTOR)
  const gapTitleToKey = songKey ? TITLE_PT * TITLE_TO_KEY_FACTOR : 0
  const keyStack = songKey ? SUBTITLE_PT * SUBTITLE_LINE_FACTOR : 0
  return Math.ceil(titleStack + gapTitleToKey + keyStack)
}

function headerOffsetFor(doc, songTitle, songKey, bodyPt){
  return headerHeightFor(doc, songTitle, songKey) + Math.ceil(bodyPt * LINE_HEIGHT_FACTOR * KEY_TO_SECTION_LINES)
}

function sectionify(song){
  const blocks = Array.isArray(song?.lyricsBlocks)
    ? song.lyricsBlocks.map(b => ({
        label: b.section || '',
        lines: (b.lines || []).map(ln => ({
          plain: ln.plain ?? ln.lyrics ?? '',
          chords: (ln.chordPositions ?? ln.chords ?? []).map(c => ({ sym: String(c.sym || ''), index: Math.max(0, c.index|0) })),
          comment: ln.comment,
          instrumental: ln.instrumental
        }))
      }))
    : Array.isArray(song?.sections)
      ? song.sections.map(s => ({
          label: s.label || s.kind || '',
          lines: (s.lines || []).map(ln => ({
            plain: ln.plain ?? ln.lyrics ?? '',
            chords: (ln.chordPositions ?? ln.chords ?? []).map(c => ({ sym: String(c.sym || ''), index: Math.max(0, c.index|0) })),
            comment: ln.comment,
            instrumental: ln.instrumental
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

function measureSectionHeight(doc, section, width, bodyPt, columns = 1){
  let h = 0
  const lineH = bodyPt * LINE_HEIGHT_FACTOR
  if (section.label) {
    h += lineH
  }
  for(const ln of section.lines || []){
    if (ln.instrumental){
      const rows = formatInstrumental(ln.instrumental, { split: columns === 2 })
      const rowCount = Math.max(1, rows.length)
      try { rows.forEach(row => doc.getTextWidth ? doc.getTextWidth(row) : null) } catch {}
      h += rowCount * lineH
      continue
    }
    if (ln.comment) {
      h += lineH
      continue
    }
    const rows = splitLyricWithChords(doc, ln.plain || '', ln.chords || [], width)
    for(const row of rows){
      if ((row.chords || []).length) h += lineH * CHORD_ABOVE_GAP
      h += lineH
    }
  }
  h += SECTION_SPACER_PT
  return { height: h, lineH }
}

function canPackOnePage(doc, sections, columns, bodyPt, songTitle, songKey){
  const width = colWidth(columns)
  const availH = PAGE.h - MARGINS.top - MARGINS.bottom - headerOffsetFor(doc, songTitle, songKey, bodyPt)
  const heights = sections.map(s => measureSectionHeight(doc, s, width, bodyPt, columns))
  if (columns === 1){
    const total = heights.reduce((n, x) => n + x.height, 0)
    return total <= availH
  }
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
      const { height } = measureSectionHeight(doc, sections[i], width, bodyPt, columns)
      if (height > rem) return null
      cols[0].push(i)
      rem -= height
    }
    return plan
  }
  let remL = availH, remR = availH
  for (let i = 0; i < sections.length; i++){
    const { height } = measureSectionHeight(doc, sections[i], width, bodyPt, columns)
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
    return null
  }
  return plan
}

function planMultiPage(doc, sections, bodyPt, songTitle, songKey){
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
  try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
  doc.setFontSize(TITLE_PT)
  const w = usableWidth()
  let lines = []
  try { lines = doc.splitTextToSize(String(songTitle || ''), w) } catch { lines = [String(songTitle || '')] }
  const arr = Array.isArray(lines) ? lines : [lines]
  const y0 = MARGINS.top + TITLE_PT
  for(let i = 0; i < arr.length; i++){
    const y = y0 + i * (TITLE_PT * TITLE_LINE_FACTOR)
    drawTextSafe(doc, arr[i], MARGINS.left, y)
  }

  try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
  doc.setFontSize(SUBTITLE_PT)
  if (songKey) {
    try { doc.setTextColor(90, 90, 90) } catch {}
    const yKey = y0 + (Math.max(0, arr.length - 1)) * (TITLE_PT * TITLE_LINE_FACTOR) + (TITLE_PT * TITLE_TO_KEY_FACTOR)
    drawTextSafe(doc, `Key of ${songKey}`, MARGINS.left, yKey)
    const yAfterKey = yKey + SUBTITLE_PT * SUBTITLE_LINE_FACTOR
    try { doc.setTextColor(0, 0, 0) } catch {}
    try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
    return yAfterKey
  }

  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  return y0 + (Math.max(0, arr.length - 1)) * (TITLE_PT * TITLE_LINE_FACTOR)
}

function isHeaderLike(text=''){
  const s = String(text).trim()
  return /^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i.test(s)
}

function renderSection(doc, section, x, y, width, lineH, columns = 1){
  let cursorY = y
  const bodyPt = Math.round(lineH / LINE_HEIGHT_FACTOR)
  doc.setFontSize(bodyPt)
  if (section.label){
    try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
    doc.setFontSize(bodyPt)
    drawTextSafe(doc, `[${String(section.label).toUpperCase()}]`, x, cursorY)
    cursorY += lineH
    try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  }

  doc.setFontSize(bodyPt)

  for(const ln of section.lines || []){
    if (ln.instrumental){
      const rows = formatInstrumental(ln.instrumental, { split: columns === 2 })
      if (rows.length){
        try { doc.setFont('NotoSansMono', 'bold') } catch { try { doc.setFont('courier', 'bold') } catch {} }
        for (const row of rows){
          drawTextSafe(doc, row, x, cursorY)
          cursorY += lineH
        }
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
      }
      continue
    }
    if (ln.comment){
      try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
      try { doc.setTextColor(120, 120, 120) } catch {}
      drawTextSafe(doc, ln.plain || '', x, cursorY)
      try { doc.setTextColor(0, 0, 0) } catch {}
      try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
      cursorY += lineH
      continue
    }
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
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
        doc.setFontSize(bodyPt)
        let lastX = -Infinity
        let spaceW = 0.01
        try { doc.setFont('NotoSansMono', 'bold'); spaceW = Math.max(0.01, doc.getTextWidth(' ')) } catch {}
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
        doc.setFontSize(bodyPt)
        for(const c of row.chords){
          const offsetInLine = Math.min(Math.max(0, c.index - (row.start || 0)), row.lyric.length)
          const pre = row.lyric.slice(0, offsetInLine)
          let chordX = x
          try { chordX = x + doc.getTextWidth(pre) } catch {}
          if (chordX < lastX + spaceW) chordX = lastX + spaceW
          try { doc.setFont('NotoSansMono', 'bold') } catch { try { doc.setFont('courier', 'bold') } catch {} }
          drawTextSafe(doc, String(c.sym), chordX, cursorY)
          try { lastX = chordX + Math.max(spaceW, doc.getTextWidth(String(c.sym))) } catch { lastX = chordX + spaceW }
          try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
          doc.setFontSize(bodyPt)
        }
        cursorY += lineH * CHORD_ABOVE_GAP
      }

      drawTextSafe(doc, row.lyric, x, cursorY)
      cursorY += lineH
    }
  }

  return cursorY + SECTION_SPACER_PT
}

function renderPlanned(doc, plan, sections, song){
  const songTitle = song?.title || 'Untitled'
  const songKey = song?.key || song?.originalKey || ''
  const cols = plan.columns
  const width = colWidth(cols)
  const lineH = plan.lineH
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
      y0 = renderSection(doc, sections[idx], x0, y0, width, lineH, cols)
    }
    if (cols === 2){
      for(const idx of colIdxs[1]){
        y1 = renderSection(doc, sections[idx], x1, y1, width, lineH, cols)
      }
    }
  }
}

function planForSong(doc, song){
  const sections = sectionify(song)
  const songTitle = song?.title || 'Untitled'
  const songKey = song?.key || song?.originalKey || ''
  const forceColumns = song?.pdfColumns === 1 ? 1 : null

  if (forceColumns === 1) {
    for(const pt of SIZE_WINDOW){
      doc.setFontSize(pt)
      if (canPackOnePage(doc, sections, 1, pt, songTitle, songKey)){
        return planOnePage(doc, sections, 1, pt, songTitle, songKey)
      }
    }
    const pt = 15
    doc.setFontSize(pt)
    return planMultiPage(doc, sections, pt, songTitle, songKey)
  }
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
  const pt = 15
  doc.setFontSize(pt)
  return planMultiPage(doc, sections, pt, songTitle, songKey)
}

function bufferOf(doc){
  const out = doc.output('arraybuffer')
  return new Uint8Array(out)
}

// ---------------------------------------------------------------------------
// Public render API (DOM-free)
// ---------------------------------------------------------------------------

export async function renderSingleSongPdfDoc(song, { registerFonts } = {}){
  const sections = sectionify(song)
  const doc = createDoc()
  await applyFonts(doc, registerFonts)
  const plan = planForSong(doc, song)
  renderPlanned(doc, plan, sections, song)
  applyFooterToAllPages(doc, { left: MARGINS.left, bottom: MARGINS.bottom }, { w: PAGE.w, h: PAGE.h })
  return { doc, plan }
}

export async function renderMultiSongPdfDoc(songs = [], { registerFonts } = {}){
  if (!Array.isArray(songs) || songs.length === 0) return null
  const doc = createDoc()
  await applyFonts(doc, registerFonts)
  for (let i = 0; i < songs.length; i++){
    const song = songs[i]
    const plan = planForSong(doc, song)
    const sections = sectionify(song)
    if (i > 0) doc.addPage([PAGE.w, PAGE.h])
    renderPlanned(doc, plan, sections, song)
  }
  applyFooterToAllPages(doc, { left: MARGINS.left, bottom: MARGINS.bottom }, { w: PAGE.w, h: PAGE.h })
  return { doc }
}

export async function renderSingleSongPdfBuffer(song, opts = {}){
  const { doc } = await renderSingleSongPdfDoc(song, opts)
  return bufferOf(doc)
}

export async function renderMultiSongPdfBuffer(songs, opts = {}){
  const res = await renderMultiSongPdfDoc(songs, opts)
  if (!res) return new Uint8Array(0)
  return bufferOf(res.doc)
}

// Plan-only helper (no rendering); identical semantics to the legacy export.
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

// Internal helpers exported only for browser songbook composition; not part
// of the bot's public surface.
export const __internal = {
  PAGE,
  MARGINS,
  GUTTER,
  TITLE_PT,
  SUBTITLE_PT,
  LINE_HEIGHT_FACTOR,
  applyFonts,
  sectionify,
  planForSong,
  renderPlanned,
  drawTextSafe,
}

// ---------------------- Test-only helpers (non-rendering) -------------------
function computeChordXsInternal({ text, chords, width, pt }){
  const doc = createDoc()
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  doc.setFontSize(pt)
  const rows = splitLyricWithChords(doc, String(text||''), chords || [], width)
  const row = rows[0] || { lyric: '', chords: [], start: 0 }
  let spaceW = 0.01
  try { doc.setFont('NotoSansMono', 'bold'); spaceW = Math.max(0.01, doc.getTextWidth(' ')) } catch {}
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
