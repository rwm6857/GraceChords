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

// Convert inline chord tokens like "[C]Hello" into separate chord and lyric lines.
function parseChordLine(line = "") {
  const chordRegex = /\[([^\]]+)\]/g;
  let lyric = "";
  let chords = "";
  let idx = 0;
  let match;
  while ((match = chordRegex.exec(line)) !== null) {
    const seg = line.slice(idx, match.index);
    lyric += seg;
    chords += " ".repeat(seg.length) + match[1];
    idx = match.index + match[0].length;
  }
  const tail = line.slice(idx);
  lyric += tail;
  chords += " ".repeat(tail.length);
  return { chord: chords.trimEnd(), lyric };
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
  try {
    doc.setFont("NotoSans", "normal");
  } catch {}
  doc.setFontSize(plan.fontPt || opts.fontPt || 12);

  plan.pages.forEach((page, pIdx) => {
    if (
      !(doc.getNumberOfPages?.() > 0) ||
      (doc.getCurrentPageInfo?.().pageNumber || 1) === 0
    ) {
      // first page already present
    } else {
      doc.addPage([opts.pageSizePt.w, opts.pageSizePt.h]);
    }

    // Header with title and optional key subtitle
    const titleAvailW = usableW;
    let titlePt = 20;
    doc.setFontSize(titlePt);
    try {
      doc.setFont("NotoSans", "bold");
    } catch {}
    if (doc.getTextWidth(String(songTitle || "")) > titleAvailW) {
      titlePt = 18;
      doc.setFontSize(18);
    }
    const titleLines = doc.splitTextToSize(String(songTitle || ""), titleAvailW);
    const titleY = opts.marginsPt.top - 24;
    doc.text(titleLines, opts.marginsPt.left, titleY);

    if (opts.songKey) {
      try {
        doc.setFont("NotoSans", "italic");
      } catch {}
      doc.setFontSize(15);
      const subY = titleY + titlePt * 1.2;
      doc.text(`Key of ${opts.songKey}`, opts.marginsPt.left, subY);
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
      let y = opts.marginsPt.top;
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
            try {
              doc.setFont("NotoSansMono", "normal");
            } catch {}
            doc.text(m[1].toUpperCase(), x, y);
            y += lineH * 1.5; // header line + half-line gap
            try {
              doc.setFont("NotoSans", "normal");
            } catch {}
            continue;
          }

          const { chord, lyric } = parseChordLine(ln);
          if (chord) {
            try {
              doc.setFont("NotoSansMono", "bold");
            } catch {}
            doc.text(doc.splitTextToSize(chord, colW), x, y);
            y += lineH;
          }
          try {
            doc.setFont("NotoSans", "normal");
          } catch {}
          doc.text(doc.splitTextToSize(lyric, colW), x, y);
          y += lineH;
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

