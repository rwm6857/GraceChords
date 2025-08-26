// Renders a planned song into a jsPDF document.
// Chords are drawn on a separate line above the wrapped lyric line,
// positioned by glyph widths and nudged minimally to avoid overlap.

const DEBUG = (() => {
  try { return localStorage.getItem("pdfPlanTrace") === "1"; } catch { return false; }
})();

function parseChordLine(line = "") {
  // Return plain lyric and absolute chord indices (in the *lyric* string)
  const chordRegex = /\[([^\]]+)\]/g;
  const chords = [];
  let lyric = "";
  let idx = 0;
  let m;
  while ((m = chordRegex.exec(line)) !== null) {
    const seg = line.slice(idx, m.index);
    lyric += seg;
    chords.push({ sym: m[1], index: lyric.length }); // chord precedes next lyric char
    idx = m.index + m[0].length;
  }
  lyric += line.slice(idx);
  return { lyric, chords };
}

export function renderSongInto(doc, songTitle, sections, plan, opts) {
  const map = new Map(sections.map((s) => [s.id, s]));

  const bodyPt = plan.fontPt || opts.fontPt || 12;
  const usableW = opts.pageSizePt.w - opts.marginsPt.left - opts.marginsPt.right;
  const twoCols = (plan.pages?.[0]?.columns?.length || 1) === 2;
  const colW = twoCols ? (usableW - (opts.gutterPt || 0)) / 2 : usableW;

  // Body font & color
  try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
  doc.setFontSize(bodyPt);
  doc.setTextColor(0, 0, 0);

  const lineH = bodyPt * 1.25;
  const spaceW = Math.max(0.01, doc.getTextWidth(" "));

  const drawCol = (x, col, headerOffsetY) => {
    let y = opts.marginsPt.top + headerOffsetY;

    if (DEBUG && (!col.sectionIds || col.sectionIds.length === 0)) {
      doc.setFontSize(10);
      doc.setTextColor(180);
      doc.text("— empty —", x, y);
      doc.setTextColor(0);
      doc.setFontSize(bodyPt);
    }

    for (const id of col.sectionIds || []) {
      const s = map.get(id);
      if (!s) continue;
      const rawLines = String(s.text || "").split(/\n/);

      for (const ln of rawLines) {
        // Section header line like "[VERSE]"
        const hdr = /^\[([^\]]+)\]$/.exec(ln.trim());
        if (hdr) {
          try { doc.setFont("NotoSans", "bold"); } catch { try { doc.setFont("Helvetica", "bold"); } catch {} }
          doc.text(`[${hdr[1].toUpperCase()}]`, x, y);
          y += lineH * 1.2;
          try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
          continue;
        }

        const { lyric, chords } = parseChordLine(ln);
        // Wrap lyric to column width (jsPDF measures with current font)
        const lyricLines = doc.splitTextToSize(lyric, colW);

        let consumed = 0;
        for (const lyricLine of lyricLines) {
          // Draw chord symbols above this wrapped line
          const start = consumed;
          const end = consumed + lyricLine.length;
          const lineChords = chords.filter(c => c.index >= start && c.index < end);

          if (lineChords.length) {
            try { doc.setFont("NotoSansMono", "bold"); } catch { try { doc.setFont("Courier", "bold"); } catch {} }
            let lastX = -Infinity;
            for (const c of lineChords) {
              const offsetInLine = c.index - start;
              const pre = lyricLine.slice(0, offsetInLine);
              let chordX = x + doc.getTextWidth(pre);
              // minimal nudge to avoid overlap with previous chord
              if (chordX < lastX + spaceW) chordX = lastX + spaceW;
              doc.text(String(c.sym), chordX, y);
              lastX = chordX + Math.max(spaceW, doc.getTextWidth(String(c.sym)));
            }
            // back to body font
            try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
            y += lineH;
          }

          // Draw the lyric line
          doc.text(lyricLine, x, y);
          y += lineH;
          consumed += lyricLine.length;
        }
      }

      y += s.postSpacing ?? 0;
    }
  };

  plan.pages.forEach((page, pIdx) => {
    // jsPDF starts with 1 page; only add for pIdx > 0
    if (pIdx > 0) doc.addPage([opts.pageSizePt.w, opts.pageSizePt.h]);

    // Header (title + "Key of ___") on first page only
    let headerOffsetY = 0;
    if (pIdx === 0) {
      // Title
      try { doc.setFont("NotoSans", "bold"); } catch { try { doc.setFont("Helvetica", "bold"); } catch {} }
      doc.setFontSize(20);
      const titleLines = doc.splitTextToSize(String(songTitle || ""), usableW);
      const titleY = Math.max(14, opts.marginsPt.top - 6);
      doc.text(titleLines, opts.marginsPt.left, titleY);
      headerOffsetY += 20 * 0.9;

      // Subtitle
      if (opts.songKey) {
        try { doc.setFont("NotoSans", "italic"); } catch { try { doc.setFont("Helvetica", "italic"); } catch {} }
        doc.setFontSize(15);
        doc.text(`Key of ${opts.songKey}`, opts.marginsPt.left, titleY + 18);
        headerOffsetY += 15 * 0.9;
      }

      // Reset body font
      try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
      doc.setFontSize(bodyPt);
    }

    const colX0 = opts.marginsPt.left;
    const colX1 = opts.marginsPt.left + colW + (twoCols ? (opts.gutterPt || 0) : 0);

    if (DEBUG) {
      doc.setDrawColor(220);
      doc.line(colX0, opts.marginsPt.top + headerOffsetY - 4, colX0 + 24, opts.marginsPt.top + headerOffsetY - 4);
      if (twoCols) doc.line(colX1, opts.marginsPt.top + headerOffsetY - 4, colX1 + 24, opts.marginsPt.top + headerOffsetY - 4);
      doc.setDrawColor(0);
    }

    drawCol(colX0, page.columns[0], headerOffsetY);
    if (twoCols) drawCol(colX1, page.columns[1], headerOffsetY);

    if (DEBUG && pIdx === 0) {
      const first = plan.pages?.[0];
      const n = (first?.columns ?? []).reduce((s, c) => s + (c.sectionIds?.length || 0), 0);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `debug: sections on first page = ${n}`,
        opts.pageSizePt.w - 8,
        opts.pageSizePt.h - 6,
        { align: "right", baseline: "bottom" }
      );
      doc.setTextColor(0);
      doc.setFontSize(bodyPt);
    }
  });
}
