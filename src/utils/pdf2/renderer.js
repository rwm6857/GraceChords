// Simple renderer that draws a prepared "plan" into a jsPDF doc.
// Part of the pdf2 pipeline which exists next to the legacy engine during
// the migration period.

const DEBUG = (() => {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("pdfPlanTrace") === "1";
  } catch {
    return false;
  }
})();

// Parse a chorded line into:
//  - lyric: plain text with chord tokens stripped
//  - chords: [{ sym, index }] character positions in the lyric string
function parseChordLine(line = "") {
  const chordRegex = /\[([^\]]+)\]/g;
  const chords = [];
  let lyric = "";
  let idx = 0;
  let match;
  while ((match = chordRegex.exec(line)) !== null) {
    const seg = line.slice(idx, match.index);
    lyric += seg;
    chords.push({ sym: match[1], index: lyric.length }); // chord precedes this lyric char
    idx = match.index + match[0].length;
  }
  lyric += line.slice(idx);
  return { lyric, chords };
  }

/**
 * Draw a layout plan into a jsPDF document.
 *
 * The renderer assumes the plan was produced by the pdf2 planner and respects
 * its "no-split" guarantees; sections are drawn exactly where the plan
 * specifies without further pagination logic.
 *
 * @param {import("jspdf").jsPDF} doc - Target document instance.
 * @param {string} songTitle - Song title placed in the header.
 * @param {Array<object>} sections - Original section objects.
 * @param {object} plan - Layout plan returned from the planner.
 * @param {object} opts - Rendering options.
 */
export function renderSongInto(doc, songTitle, sections, plan, opts) {
  const map = new Map(sections.map((s) => [s.id, s]));

  const usableW = opts.pageSizePt.w - opts.marginsPt.left - opts.marginsPt.right;
  const twoCols = plan.pages[0]?.columns?.length === 2;
  const colW = twoCols ? (usableW - opts.gutterPt) / 2 : usableW;
  const firstPageSections =
    plan.pages?.[0]?.columns?.reduce((n, c) => n + (c.sectionIds?.length || 0), 0) || 0;

  // Fonts (assumes you registered Noto; otherwise falls back to default)
  try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
  doc.setFontSize(plan.fontPt || opts.fontPt || 12);
  doc.setTextColor(0, 0, 0);

  plan.pages.forEach((page, pIdx) => {
    // jsPDF starts with one blank page; draw on it for pIdx=0, add new pages afterwards
    if (pIdx > 0) {
      doc.addPage([opts.pageSizePt.w, opts.pageSizePt.h]);
    }

    // Header with title and optional key subtitle
    let headerOffsetY = 0;
    if (pIdx === 0) {
      const titleAvailW = usableW;
      let titlePt = 20;
      doc.setFontSize(titlePt);
      try { doc.setFont("NotoSans", "bold"); } catch { try { doc.setFont("Helvetica", "bold"); } catch {} }
      const titleLines = doc.splitTextToSize(String(songTitle || ""), titleAvailW);
      const titleY = opts.marginsPt.top - 4; // draw near top margin
      doc.text(titleLines, opts.marginsPt.left, titleY);
      headerOffsetY = titlePt * 1.2;

      if (opts.songKey) {
        try { doc.setFont("NotoSans", "italic"); } catch { try { doc.setFont("Helvetica", "italic"); } catch {} }
        doc.setFontSize(15);
        const subY = titleY + titlePt * 0.9;
        doc.text(`Key of ${opts.songKey}`, opts.marginsPt.left, subY);
        headerOffsetY += 15 * 1.0;
      }
      // Reset body font
      try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
      doc.setFontSize(plan.fontPt || opts.fontPt || 12);
    }

    // Reset font to body
    try {
      doc.setFont("NotoSans", "normal");
    } catch {}
    doc.setFontSize(plan.fontPt || opts.fontPt || 12);

    const colX0 = opts.marginsPt.left;
    const colX1 = opts.marginsPt.left + colW + (twoCols ? opts.gutterPt : 0);

    if (DEBUG) {
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(colX0, opts.marginsPt.top, colX0, opts.pageSizePt.h - opts.marginsPt.bottom);
      if (twoCols)
        doc.line(colX1, opts.marginsPt.top, colX1, opts.pageSizePt.h - opts.marginsPt.bottom);
      doc.setDrawColor(0);
    }

    const lineH = (plan.fontPt || opts.fontPt || 12) * 1.25;

    const drawCol = (x, col) => {
      let y = opts.marginsPt.top + (pIdx === 0 ? headerOffsetY : 0);
      if (DEBUG && (!col.sectionIds || col.sectionIds.length === 0)) {
        doc.setTextColor(180);
        doc.text("— empty —", x, y);
        doc.setTextColor(0);
      }
      for (const id of col.sectionIds || []) {
        const s = map.get(id);
        if (!s) continue;
        const rawLines = String(s.text || "").split(/\n/);
        for (const ln of rawLines) {
          const m = /^\[([^\]]+)\]$/.exec(ln.trim());
          if (m) {
            // Section header
           try { doc.setFont("NotoSans", "bold"); } catch { try { doc.setFont("Helvetica", "bold"); } catch {} }
           doc.text(`[${m[1].toUpperCase()}]`, x, y);
           y += lineH * 1.2; // header plus small gap
           try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }

            continue;
          }

          const { lyric, chords } = parseChordLine(ln);
          // Wrap lyric to column width
          const lyricLines = doc.splitTextToSize(lyric, colW);
          // For chord collision avoidance
          const spaceW = Math.max(0.01, doc.getTextWidth(" "));

          // draw each wrapped line with its chords above it
          let consumed = 0;
          for (const lyricLine of lyricLines) {
            // chords whose index falls within this slice
            const start = consumed;
            const end = consumed + lyricLine.length;
            const lineChords = chords.filter(c => c.index >= start && c.index < end);

            if (lineChords.length) {
              try { doc.setFont("NotoSansMono", "bold"); } catch { try { doc.setFont("Courier", "bold"); } catch {} }
              let lastX = -Infinity;
              for (const c of lineChords) {
                const offsetInLine = c.index - start;
                // measure x by lyric font metrics up to that char in this wrapped line
                const pre = lyricLine.slice(0, offsetInLine);
                let chordX = x + doc.getTextWidth(pre);
                // nudge minimally to avoid overlap with previous chord
                if (chordX < lastX + spaceW) chordX = lastX + spaceW;
                doc.text(String(c.sym), chordX, y);
                lastX = chordX + Math.max(spaceW, doc.getTextWidth(String(c.sym)));
              }
              // body font back
              try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
              // advance one line after chords
              y += lineH;
            }

            // draw the lyric line
            try { doc.setFont("NotoSans", "normal"); } catch { try { doc.setFont("Helvetica", "normal"); } catch {} }
            doc.text(lyricLine, x, y);
            y += lineH;
            consumed += lyricLine.length;
          }
        }
        y += s.postSpacing ?? 0;
      }
    };

    drawCol(colX0, page.columns[0]);
    if (twoCols) drawCol(colX1, page.columns[1]);

    if (DEBUG && pIdx === 0) {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `debug: sections on first page = ${firstPageSections}`,
        opts.marginsPt.left,
        opts.pageSizePt.h - 4,
        { baseline: "bottom" }
      );
      doc.setTextColor(0);
      doc.setFontSize(plan.fontPt || opts.fontPt || 12);
    }
  });
}

