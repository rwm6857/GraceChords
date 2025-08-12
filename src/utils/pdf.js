// src/utils/pdf.js
import { ensureFontsEmbedded } from './fonts'

// Debug switch: open DevTools and run localStorage.setItem('pdfDebug','1') to see guides
const PDF_DEBUG = typeof window !== 'undefined'
  && (() => { try { return localStorage.getItem('pdfDebug') === '1' } catch { return false } })()


/* -----------------------------------------------------------
 * Lazy jsPDF
 * --------------------------------------------------------- */
async function newPDF() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'pt', format: 'letter' })
}

/* -----------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */
function isSectionLabel(text = '') {
  return /^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i
    .test(String(text).trim())
}

/** Create a lyrics-width measurer bound to a jsPDF doc + font settings */
function makeLyricMeasurer(doc, lyricFamily, lyricPt) {
  return (text) => {
    doc.setFont(lyricFamily, 'normal')
    doc.setFontSize(lyricPt)
    return doc.getTextWidth(text || '')
  }
}

/* -----------------------------------------------------------
 * Input normalization
 * --------------------------------------------------------- */
function normalizeSongInput(input) {
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

/* -----------------------------------------------------------
 * Layout config
 * --------------------------------------------------------- */
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

// Safety against kissing the right gutter
const RIGHT_SAFETY = 6;     // pt
// How "tight" a 2-col line may be before we reject it for readability
const TIGHT_RATIO_2COL = 0.92;
const TIGHT_RATIO_2COL_AT_12 = 0.86; // be stricter at the minimum size

/**
 * Pure width check using provided measurers (lyrics/chords).
 * Respects the alignment invariant: chord X measured in lyrics font; chords drawn in mono bold.
 */
function widthOverflows(song, columns, size, oBase, makeMeasureLyricAt, makeMeasureChordAt){
  const margin = oBase.margin;
  const contentW = oBase.pageWidth - margin * 2;
  const colW = columns === 2 ? (contentW - oBase.gutter) / 2 : contentW;
  const limit = colW - RIGHT_SAFETY;

  const measureLyric = makeMeasureLyricAt(size);
  const measureChord = makeMeasureChordAt(size);

  for (const block of (song.lyricsBlocks || [])) {
    for (const ln of (block.lines || [])) {
      const plain = ln.plain || ln.text || '';
      if (measureLyric(plain) > limit) return true;
      for (const c of (ln.chordPositions || [])) {
        const x = measureLyric(plain.slice(0, c.index || 0));
        const cw = measureChord(c.sym || '');
        if (x + cw > limit) return true;
      }
    }
  }
  return false;
}

/** How close the widest line/chord right-edge is to the column edge (0..1). */
function maxWidthRatio(song, columns, size, oBase, makeMeasureLyricAt, makeMeasureChordAt){
  const margin = oBase.margin;
  const contentW = oBase.pageWidth - margin * 2;
  const colW = columns === 2 ? (contentW - oBase.gutter) / 2 : contentW;

  const measureLyric = makeMeasureLyricAt(size);
  const measureChord = makeMeasureChordAt(size);

  let maxR = 0;
  for (const block of (song.lyricsBlocks || [])) {
    for (const ln of (block.lines || [])) {
      const plain = ln.plain || ln.text || '';
      maxR = Math.max(maxR, (measureLyric(plain) || 0) / colW);
      for (const c of (ln.chordPositions || [])) {
        const x = measureLyric(plain.slice(0, c.index || 0));
        const cw = measureChord(c.sym || '');
        maxR = Math.max(maxR, (x + cw) / colW);
      }
    }
  }
  return maxR;
}

/**
 * Core planner (pure): implements your priority rules.
 * - Size-first search 16→12
 * - For each size: try 1-col, then 2-col (2-col must not be "tight")
 * - Fallback at 12pt: choose fewest pages; then width OK; then prefer 1-col
 */
function choosePlanPure(songNorm, oBase, makeMeasureLyricAt, makeMeasureChordAt){
  const minSize = 12;
  const maxSize = 16;

  // Ensure section labels are promoted to headers (safety net)
  const song = { ...songNorm, lyricsBlocks: (songNorm.lyricsBlocks || []).map(b => {
    if (!b?.section && Array.isArray(b?.lines) && b.lines.length) {
      const first = b.lines[0];
      const txt = first?.plain || first?.text || '';
      const hasChords = Array.isArray(first?.chordPositions) && first.chordPositions.length > 0;
      if (!hasChords && isSectionLabel(txt)) {
        return { section: txt.trim(), lines: b.lines.slice(1) };
      }
    }
    return b;
  })};

  // Helper to evaluate a plan
  const evalPlan = (cols, size) => {
    const widthOk = !widthOverflows(song, cols, size, oBase, makeMeasureLyricAt, makeMeasureChordAt);
    const measureLyric = makeMeasureLyricAt(size);
    const layout = computeLayout(song, { ...oBase, columns: cols, lyricSizePt: size, chordSizePt: size }, measureLyric);
    const heightOk = (layout.pages.length <= 1);
    const tight = cols === 2 && maxWidthRatio(song, cols, size, oBase, makeMeasureLyricAt, makeMeasureChordAt) >= TIGHT_RATIO_2COL;
    return { widthOk, heightOk, tight, layout };
  };

  // Size-first search: 16 → 12; try 1-col then 2-col
  for (let size = maxSize; size >= minSize; size--) {
    // 1 column
    {
      const r = evalPlan(1, size);
      if (r.widthOk && r.heightOk) {
        return { columns: 1, lyricSizePt: size, chordSizePt: size, layout: r.layout };
      }
    }
    // 2 columns (must not be "tight")
    {
      const r = evalPlan(2, size);
      const tooTightAt12 = (size === 12) &&
         (maxWidthRatio(song, 2, size, oBase, makeMeasureLyricAt, makeMeasureChordAt) >= TIGHT_RATIO_2COL_AT_12);
      if (r.widthOk && r.heightOk && !r.tight && !tooTightAt12) {
        return { columns: 2, lyricSizePt: size, chordSizePt: size, layout: r.layout };
      }
    }
  }

  // Fallback at 12pt: fewest pages; then width OK; then prefer 1-col
  const size = minSize;
  const plans = [1,2].map(cols => ({ cols, ...evalPlan(cols, size) }));
  plans.sort((a,b) => {
    if (a.layout.pages.length !== b.layout.pages.length) return a.layout.pages.length - b.layout.pages.length;
    if (a.widthOk !== b.widthOk) return (a.widthOk ? -1 : 1);
    if (a.cols !== b.cols) return (a.cols === 1 ? -1 : 1);
    return 0;
  });
  const best = plans[0];
  return { columns: best.cols, lyricSizePt: size, chordSizePt: size, layout: best.layout };
}


/* -----------------------------------------------------------
 * PURE LAYOUT (two-pass; no drawing)
 * - measures with lyrics font only
 * - splits only at line boundaries
 * - never orphans section header from first line
 * - bold headings, same size as lyrics, with top padding
 * --------------------------------------------------------- */
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
   const blockHeight = (block) => {
     let h = 0
     if (block.section) h += sectionTopPad + sectionSize + 4
     for (const ln of (block.lines || [])) {
       if (ln?.chordPositions?.length) h += o.chordSizePt + lineGap / 2
       h += o.lyricSizePt + lineGap
     }
     return h + 4
   }
   const lineHeight = (ln) => {
     let h = 0
     if (ln?.chordPositions?.length) h += o.chordSizePt + lineGap / 2
     h += o.lyricSizePt + lineGap
     return h
   }
 

  const pushSection = (col, header) => col.blocks.push({ type: 'section', header: String(header) })
  const pushLine = (col, plain, chordPositions) => {
    const chords = (chordPositions || []).map(c => ({
      sym: c.sym,
      x: measureLyric(plain.slice(0, c.index || 0))
    }))
    col.blocks.push({ type: 'line', lyrics: plain, chords })
  }

   for (const block of song.lyricsBlocks) {
     const need = blockHeight(block)
     const avail = contentBottomY - cursorY
     const fullColAvail = contentBottomY - contentStartY
 
     // 1) If whole section fits here, place intact
     if (need <= avail) {
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
 
     // 2) If it fits in a fresh column/page, move wholesale (do NOT split)
     if (need <= fullColAvail) {
       advanceColOrPage()
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
 
     // 3) Oversized section (cannot fit in a full column at this size) → split at line boundaries,
     //    but keep header with the first line, and never leave header stranded.
     let i = 0
     while (i < (block.lines || []).length) {
       // Ensure there is room for header + at least one line; otherwise advance
       const firstLineH = lineHeight(block.lines[i])
       const minHeadSlice = (i === 0 && block.section) ? (sectionTopPad + sectionSize + 4 + firstLineH) : firstLineH
       if (cursorY + minHeadSlice > contentBottomY) { advanceColOrPage() }
 
       const col = curCol()
       if (i === 0 && block.section) { cursorY += sectionTopPad; pushSection(col, block.section); cursorY += sectionSize + 4 }
 
       // Fill as many lines as fit
       while (i < block.lines.length) {
         const h = lineHeight(block.lines[i])
         if (cursorY + h > contentBottomY) break
         const ln = block.lines[i]
         const plain = ln.plain || ln.text || ''
         const cps = ln.chordPositions || []
         pushLine(col, plain, cps)
         cursorY += h
         i++
       }
       cursorY += 4
       if (i < block.lines.length) advanceColOrPage()
     }
   }
   return { pages }
 }

/* -----------------------------------------------------------
 * DRAWING (consumes computeLayout)
 * --------------------------------------------------------- */
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
  const contentW = pageW - margin * 2
  const colW = o.columns === 2 ? (contentW - o.gutter) / 2 : contentW

  layout.pages.forEach((p, pIdx) => {
    if (pIdx > 0) doc.addPage()
     // Debug overlay: draw column boxes + plan footer
     if (PDF_DEBUG) {
       doc.setDrawColor(180)
       // Column 1 box
       doc.rect(margin, contentStartY, colW, pageH - margin - contentStartY)
       if (o.columns === 2) {
         // Column 2 box
         doc.rect(margin + colW + o.gutter, contentStartY, colW, pageH - margin - contentStartY)
       }
       // Footer with chosen plan
       doc.setFont(lFam, 'normal'); doc.setFontSize(9)
       doc.text(
         `Plan: ${o.columns} col • size ${o.lyricSizePt}pt • family ${o.lyricFamily}/${o.chordFamily}`,
         margin,
         pageH - (margin * 0.6)
       )
     }
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

/* -----------------------------------------------------------
 * Fit planner (width + height; shrink-to-fit ≥12pt)
 * --------------------------------------------------------- */
async function planFitOnOnePage(doc, songIn, baseOpt = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const oBase = { ...DEFAULT_LAYOUT_OPT, ...baseOpt, pageWidth: pageW, pageHeight: pageH };

  let fams = {};
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const lyricFamily = fams.lyricFamily || oBase.lyricFamily || 'Helvetica';
  const chordFamily = fams.chordFamily || oBase.chordFamily || 'Courier';

  const makeMeasureLyricAt = (pt) => (text) => {
    doc.setFont(lyricFamily, 'normal'); doc.setFontSize(pt);
    return doc.getTextWidth(text || '');
  };
  const makeMeasureChordAt = (pt) => (text) => {
    doc.setFont(chordFamily, 'bold'); doc.setFontSize(pt);
    return doc.getTextWidth(text || '');
  };

  const songNorm = normalizeSongInput(songIn);
  const pick = choosePlanPure(songNorm, { ...oBase, lyricFamily, chordFamily }, makeMeasureLyricAt, makeMeasureChordAt);
  if (pick.columns === 2 && pick.lyricSizePt === 12) {
    const ratio = maxWidthRatio(songNorm, 2, 12, oBase, makeMeasureLyricAt, makeMeasureChordAt);
    if (ratio >= TIGHT_RATIO_2COL_AT_12) {
      const measureLyric12 = makeLyricMeasurer(doc, lyricFamily, 12);
      const layout1 = computeLayout(songNorm, { ...oBase, columns: 1, lyricSizePt: 12, chordSizePt: 12 }, measureLyric12);
      return { columns: 1, lyricSizePt: 12, chordSizePt: 12, lyricFamily, chordFamily, layout: layout1 };
    }
  }
  return { columns: pick.columns, lyricSizePt: pick.lyricSizePt, chordSizePt: pick.chordSizePt, lyricFamily, chordFamily, layout: pick.layout };
}


/* -----------------------------------------------------------
 * PUBLIC APIS
 * --------------------------------------------------------- */
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

export async function downloadSongbookPdf(songs, options = {}) {
  const doc = await newPDF();
  let fams = {};
  try { fams = await ensureFontsEmbedded(doc); } catch {}
  const baseOpt = {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier',
    columns: options?.columns === 2 ? 2 : 1
  };

  const includeTOC = !!options?.includeTOC;
  const cover = options?.cover;

  // Pre-compute layout pages for each song
  const measure = makeLyricMeasurer(doc, baseOpt.lyricFamily, baseOpt.lyricSizePt);
  const planned = songs.map((s) => ({
    raw: s,
    norm: normalizeSongInput(s),
    layout: computeLayout(s, { ...baseOpt }, measure)
  }));

  const startPage = 1 + (cover ? 1 : 0) + (includeTOC ? 1 : 0);
  let curPage = startPage;
  const tocEntries = planned.map((p, i) => {
    const entry = { num: i + 1, title: p.norm.title || 'Untitled', page: curPage };
    p.start = curPage;
    curPage += p.layout.pages.length;
    return entry;
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Cover page
  if (cover) {
    try {
      doc.addImage(cover, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    } catch {}
    if (includeTOC || planned.length) doc.addPage();
  }

  // TOC
  if (includeTOC) {
    const margin = baseOpt.margin;
    doc.setFont(baseOpt.lyricFamily, 'bold');
    doc.setFontSize(24);
    doc.text('Table of Contents', pageW / 2, margin + 20, { align: 'center' });
    doc.setFont(baseOpt.lyricFamily, 'normal');
    doc.setFontSize(12);
    let y = margin + 40;
    const lineH = 16;
    const right = pageW - margin;
    tocEntries.forEach((e) => {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      const leftText = `${e.num} ${e.title}`;
      doc.text(leftText, margin, y);
      const pageStr = String(e.page);
      const textW = doc.getTextWidth(leftText);
      const pageWdt = doc.getTextWidth(pageStr);
      const dotsW = right - margin - textW - pageWdt - 4;
      if (dotsW > 0) {
        const dot = doc.getTextWidth('.');
        const dots = '.'.repeat(Math.max(0, Math.floor(dotsW / dot)));
        doc.text(dots, margin + textW + 2, y);
      }
      doc.text(pageStr, right, y, { align: 'right' });
      y += lineH;
    });
    if (planned.length) doc.addPage();
  }

  // Songs
  planned.forEach((p, idx) => {
    drawSongIntoDoc(doc, p.raw, {
      ...baseOpt,
      title: `${idx + 1}. ${p.norm.title || 'Untitled'}`,
      key: p.norm.key || 'C',
      columns: baseOpt.columns
    });
    if (idx < planned.length - 1) doc.addPage();
  });

  const name = `songbook-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.pdf`;
  doc.save(name);
}

/* -----------------------------------------------------------
 * TEST METRICS (sync; no jsPDF)
 * --------------------------------------------------------- */
export function getLayoutMetrics(input, opts) {
  const o = { ...DEFAULT_LAYOUT_OPT, ...opts }
  o.pageWidth = 612
  o.pageHeight = 792
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

// Test-only: pure planner with deterministic measurers (no jsPDF)
export function planForTest(input, opts){
  const song = normalizeSongInput(input);
  const o = { ...DEFAULT_LAYOUT_OPT, ...opts };
  // Letter
  o.pageWidth = 612; o.pageHeight = 792;

  const makeMeasureLyricAt = (pt) => (text) => (text ? text.length * (pt * 0.6) : 0);
  const makeMeasureChordAt = (pt) => (text) => (text ? text.length * (pt * 0.6) : 0);

  const pick = choosePlanPure(song, o, makeMeasureLyricAt, makeMeasureChordAt);
  return {
    columns: pick.columns,
    size: pick.lyricSizePt,
    pages: pick.layout.pages.length
  };
}

