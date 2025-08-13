// src/utils/pdf.js
import { ensureFontsEmbedded } from './fonts'
import { planSongLayout, computeLayout, normalizeSongInput, DEFAULT_LAYOUT_OPT } from './pdf-plan'

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

/** Create a lyrics-width measurer bound to a jsPDF doc + font settings */
function makeLyricMeasurer(doc, lyricFamily, lyricPt) {
  return (text) => {
    doc.setFont(lyricFamily, 'normal')
    doc.setFontSize(lyricPt)
    return doc.getTextWidth(text || '')
  }
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

  const plan = planSongLayout(songIn, { ...oBase, lyricFamily, chordFamily }, makeMeasureLyricAt, makeMeasureChordAt);
  return plan;
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
  return { plan }
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

