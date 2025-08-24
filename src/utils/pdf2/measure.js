// DOM-based measurement with caching; matches renderer's line-height & font.

const cache = new Map();
let measurer = null;

function ensureMeasurer(columnWidthPt, fontPt) {
  if (!measurer) {
    measurer = document.createElement("div");
    Object.assign(measurer.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: `${columnWidthPt}px`,
      whiteSpace: "pre-wrap",
      visibility: "hidden",
    });
    document.body.appendChild(measurer);
  } else {
    measurer.style.width = `${columnWidthPt}px`;
  }
  measurer.style.fontSize = `${fontPt}pt`;
  measurer.style.lineHeight = "1.25";
  measurer.style.fontFamily = `"Noto Sans", Arial, sans-serif`;
}

function columnWidthPt(opts) {
  const { w } = opts.pageSizePt;
  const { left, right } = opts.marginsPt;
  const usableW = w - left - right;
  const gutter = opts.gutterPt;
  return opts.maxColumns === 2 ? (usableW - gutter) / 2 : usableW;
}

export async function measureSection(s, fontPt, opts) {
  const key = `${s.id}|${fontPt}|${opts.maxColumns}`;
  if (cache.has(key)) {
    return { id: s.id, height: cache.get(key), postSpacing: s.postSpacing ?? 0 };
  }

  const widthPt = columnWidthPt(opts);
  ensureMeasurer(widthPt, fontPt);

  measurer.textContent = s.text || "";
  const rect = measurer.getBoundingClientRect();

  // px -> pt (assuming 96dpi): 1pt = 0.75px
  const pxToPt = 72 / 96;
  const heightPt = rect.height * pxToPt;

  cache.set(key, heightPt);
  return { id: s.id, height: heightPt, postSpacing: s.postSpacing ?? 0 };
}
