// Simple renderer that draws a prepared "plan" into a jsPDF doc.
// Part of the pdf2 pipeline which exists next to the legacy engine during
// the migration period.

const DEBUG = (() => {
  try { return typeof window !== "undefined" && window.localStorage?.getItem("pdfPlanTrace") === "1"; }
  catch { return false; }
})();

export function renderSongInto(doc, songTitle, sections, plan, opts) {
  const map = new Map(sections.map((s) => [s.id, s]));

  const usableW = opts.pageSizePt.w - opts.marginsPt.left - opts.marginsPt.right;
  const twoCols = plan.pages[0]?.columns?.length === 2;
  const colW = twoCols ? (usableW - opts.gutterPt) / 2 : usableW;
  const firstPageSections = plan.pages?.[0]?.columns?.reduce((n, c) => n + (c.sectionIds?.length || 0), 0) || 0;

  // Fonts (assumes you registered Noto; otherwise falls back to default)
  try { doc.setFont("NotoSans", "normal"); } catch {}
  doc.setFontSize(plan.fontPt || opts.fontPt || 12);

  plan.pages.forEach((page, pIdx) => {
    if (!(doc.getNumberOfPages?.() > 0) || (doc.getCurrentPageInfo?.().pageNumber || 1) === 0) {
      // first page already present
    } else {
      doc.addPage([opts.pageSizePt.w, opts.pageSizePt.h]);
    }

    // Header
    doc.setFontSize(Math.max((plan.fontPt || opts.fontPt || 12) + 2, 12));
    doc.text(String(songTitle || ""), opts.marginsPt.left, opts.marginsPt.top - 8, { baseline: "bottom" });
    doc.setFontSize(plan.fontPt || opts.fontPt || 12);

    const colX0 = opts.marginsPt.left;
    const colX1 = opts.marginsPt.left + colW + (twoCols ? opts.gutterPt : 0);

    if (DEBUG) {
      doc.setDrawColor(200);
      doc.setLineWidth(0.5);
      doc.line(colX0, opts.marginsPt.top, colX0, opts.pageSizePt.h - opts.marginsPt.bottom);
      if (twoCols) doc.line(colX1, opts.marginsPt.top, colX1, opts.pageSizePt.h - opts.marginsPt.bottom);
      doc.setDrawColor(0);
    }

    const drawCol = (x, col) => {
      let y = opts.marginsPt.top;
      if (DEBUG && (!col.sectionIds || col.sectionIds.length === 0)) {
        doc.setTextColor(180);
        doc.text("— empty —", x, y);
        doc.setTextColor(0);
      }
      for (const id of col.sectionIds) {
        const s = map.get(id);
        if (!s) continue;
        const lines = doc.splitTextToSize(s.text || "", colW);
        doc.text(lines, x, y);
        const lineH = (plan.fontPt || opts.fontPt || 12) * 1.25;
        y += lines.length * lineH + (s.postSpacing ?? 0);
      }
    };

    drawCol(colX0, page.columns[0]);
    if (twoCols) drawCol(colX1, page.columns[1]);

    if (DEBUG && pIdx === 0) {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`debug: sections on first page = ${firstPageSections}`, opts.marginsPt.left, opts.pageSizePt.h - 4, { baseline: "bottom" });
      doc.setTextColor(0);
      doc.setFontSize(plan.fontPt || opts.fontPt || 12);
    }
  });
}
