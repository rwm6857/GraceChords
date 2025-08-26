// DOM-based measurement with caching; matches renderer's line-height & font.
// Used only by the pdf2 engine, which currently co-exists with the legacy
// pdf generator during migration.

const cache = new Map();
let measurer = null;

/**
 * Lazily create and configure a hidden DOM element used for text measurement.
 *
 * The element mirrors the renderer's font and line height so that measured
 * values match what will later be drawn to the PDF. Its width is updated on
 * each call so callers can measure using different column widths.
 *
 * @param {number} columnWidthPt - Column width in points.
 * @param {number} fontPt - Font size in points.
 */
function ensureMeasurer(columnWidthPt, fontPt) {
  if (!measurer) {
    measurer = document.createElement("div");
    Object.assign(measurer.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: "0px",
      whiteSpace: "pre-wrap",
      visibility: "hidden",
    });
    document.body.appendChild(measurer);
  } else {
    measurer.style.width = "0px";
  }
  measurer.style.fontSize = `${fontPt}pt`;
  measurer.style.lineHeight = "1.25";
  measurer.style.fontFamily = `"Noto Sans", Arial, sans-serif`;
}

/**
 * Measure a section's rendered height in points.
 *
 * Measurements are cached by section ID, font size and column count. The
 * browser reports measurements in CSS pixels, so we convert to printer points
 * (1pt = 1/72in) assuming a 96 DPI environment. This mirrors what jsPDF uses
 * internally and keeps planner math consistent with rendering.
 *
 * @param {{id: string, text: string, postSpacing?: number}} s - Section to measure.
 * @param {number} fontPt - Font size in points.
 * @param {number} columnWidthPt - Column width in points.
 * @returns {Promise<{id: string, height: number, postSpacing: number}>}
 *   Section ID with measured height and optional spacing.
 */
export async function measureSection(s, fontPt, columnWidthPt) {
  const key = `${s.id}|${fontPt}|${columnWidthPt}`;
  if (cache.has(key)) {
    return { id: s.id, height: cache.get(key), postSpacing: s.postSpacing ?? 0 };
  }

  // convert column width from pt → px (96 dpi assumption)
  const ptToPx = 96 / 72;
  const columnWidthPx = Math.max(1, Math.round(columnWidthPt * ptToPx));
  ensureMeasurer(columnWidthPt, fontPt);
  measurer.style.width = `${columnWidthPx}px`;
  measurer.textContent = s.text || "";
  const rect = measurer.getBoundingClientRect();

  // Convert px -> pt (96 DPI assumption).
  const pxToPt = 72 / 96;
  const heightPt = rect.height * pxToPt;

  cache.set(key, heightPt);
  return { id: s.id, height: heightPt, postSpacing: s.postSpacing ?? 0 };
}
