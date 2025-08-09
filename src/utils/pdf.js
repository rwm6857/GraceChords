// src/utils/pdf.js
import { jsPDF } from 'jspdf';
import { ensureFontsEmbedded } from './fonts';

// Estimate if 1 column likely fits a page
function estimateOnePage(song, opt) {
  const lines = song.lyricsBlocks.reduce((n, b) => n + b.lines.length, 0);
  const perLine = (opt.chordSizePt + opt.lyricSizePt) * 1.35;
  const header = 64;
  const margin = opt.margin || 36;
  const pageH = 792; // letter height in pt
  const total = header + lines * perLine + margin;
  return total < (pageH - margin * 2);
}

// Paint one song into an existing jsPDF doc
function drawSongIntoDoc(doc, song, opt) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = opt.margin ?? 36;
  const contentW = pageW - margin * 2;
  const gutter = 18;

  const columnCount =
    opt.columns === 'auto' ? (estimateOnePage(song, opt) ? 1 : 2) : Number(opt.columns || 1);
  const colW = columnCount === 2 ? (contentW - gutter) / 2 : contentW;

  // Header
  doc.setFont(opt.lyricFamily, 'bold');
  doc.setFontSize(18);
  doc.text(opt.title || song.title, margin, margin);

  doc.setFont(opt.lyricFamily, 'normal');
  doc.setFontSize(11);
  const sub = `Key: ${opt.key || song.key || '—'}${opt.tags ? '  •  ' + opt.tags : ''}`;
  doc.text(sub, margin, margin + 16);

  // Footer (page number)
  function footer() {
    const pageNum = doc.internal.getNumberOfPages();
    doc.setFont(opt.lyricFamily, 'normal');
    doc.setFontSize(10);
    doc.text(String(pageNum), pageW / 2, pageH - 16, { align: 'center' });
  }

  let x = margin;
  let y = margin + 36;
  footer();

  const lineGap = 4;

  function wrapText(text, maxWidth) {
    if (!text) return [''];
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = (line ? line + ' ' : '') + w;
      const width = doc.getTextWidth(test);
      if (width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function ensureSpace(neededHeight) {
    if (y + neededHeight <= pageH - margin) return;
    if (columnCount === 2 && x === margin) {
      x = margin + colW + gutter;
      y = margin + 36;
    } else {
      doc.addPage();
      x = margin;
      y = margin + 36;
      footer();
    }
  }

  function drawChordLyricPair(chords, lyric) {
    if (chords && chords.trim()) {
      doc.setFont(opt.chordFamily, 'bold');
      doc.setFontSize(opt.chordSizePt);
      const lines = wrapText(chords, colW);
      lines.forEach((ln) => {
        doc.text(ln, x, y);
        y += opt.chordSizePt + lineGap / 2;
      });
    }
    doc.setFont(opt.lyricFamily, 'normal');
    doc.setFontSize(opt.lyricSizePt);
    const linesL = wrapText(lyric, colW);
    linesL.forEach((ln) => {
      doc.text(ln, x, y);
      y += opt.lyricSizePt + lineGap;
    });
  }

  song.lyricsBlocks.forEach((block) => {
    const sec = (block.section || '').trim();
    if (sec) {
      doc.setFont(opt.lyricFamily, 'bold');
      doc.setFontSize(12);
      ensureSpace(14 + 8);
      doc.text(sec, x, y);
      y += 14;
    }
    block.lines.forEach((ln) => {
      const approx = opt.chordSizePt + opt.lyricSizePt + 2 * lineGap + 4;
      ensureSpace(approx);
      drawChordLyricPair(ln.chords || '', ln.text || '');
    });
    y += 4;
  });
}

// Build a single-song doc (async for font embedding)
export async function songToPdfDoc(song, options) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const opt = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: options?.columns || 'auto',
    title: options?.title || song.title,
    key: options?.key || song.key,
    tags: options?.tags || (song.tags || []).join(', '),
    margin: 36,
    lyricFamily: 'Helvetica',
    chordFamily: 'Courier',
  };

  try {
    const families = await ensureFontsEmbedded(doc);
    opt.lyricFamily = options?.lyricFont || families.lyricFamily || 'Helvetica';
    opt.chordFamily = options?.chordFont || families.chordFamily || 'Courier';
  } catch {
    // fall back silently to built-ins
  }

  drawSongIntoDoc(doc, song, opt);
  return doc;
}

export async function downloadSingleSongPdf(song, options) {
  const doc = await songToPdfDoc(song, options || {});
  doc.save(`${song.title.replace(/\s+/g, '_')}.pdf`);
}

export async function downloadMultiSongPdf(songs, options) {
  if (!songs || !songs.length) return;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const base = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: options?.columns || 'auto',
    margin: 36,
    lyricFamily: 'Helvetica',
    chordFamily: 'Courier',
  };

  try {
    const families = await ensureFontsEmbedded(doc);
    base.lyricFamily = options?.lyricFont || families.lyricFamily || 'Helvetica';
    base.chordFamily = options?.chordFont || families.chordFamily || 'Courier';
  } catch {}

  songs.forEach((song, idx) => {
    if (idx > 0) doc.addPage();
    drawSongIntoDoc(doc, song, {
      ...base,
      title: song.title,
      key: song.key,
      tags: (song.tags || []).join(', '),
    });
  });
  doc.save('Songbook_Selection.pdf');
}
