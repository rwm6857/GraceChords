// Column packing used by pdf2. The legacy engine has its own layout
// routines; this implementation exists alongside it during migration.
/**
 * Greedily pack measured sections into column/page buckets.
 *
 * Sections are never split; if a section's height exceeds the remaining space
 * in the current column, the packer advances to the next column or page. This
 * simple greedy strategy keeps layout deterministic and mirrors the behaviour
 * of the legacy PDF generator.
 *
 * @param {Array<{id: string, height: number, postSpacing?: number}>} measured
 *   Pre-measured section heights.
 * @param {{columns: number, pageSizePt: {h:number}, marginsPt: object, forceMultiPage?: boolean}} opts
 *   Layout options.
 * @returns {{pages: Array<{columns: Array<{sectionIds: string[], height: number}>}>}|null}
 *   Packed pages or null if content cannot fit without splitting.
 */
export function packColumns(
  measured,
  { columns, pageSizePt, marginsPt, forceMultiPage }
) {
  const usableH = pageSizePt.h - marginsPt.top - marginsPt.bottom;
  if (usableH <= 0) {
    return {
      pages: [{ columns: Array.from({ length: columns }, () => ({ sectionIds: [], height: 0 })) }],
    };
  }

  const newCols = () =>
    Array.from({ length: columns }, () => ({ sectionIds: [], height: 0 }));
  const pages = [];
  let pageCols = newCols();
  let colIdx = 0;

  const flushPage = () => {
    pages.push({ columns: pageCols.map((c) => ({ ...c })) });
  };

  for (const m of measured) {
    const hNeeded = m.height + (m.postSpacing ?? 0);

    if (hNeeded > usableH && !forceMultiPage) {
      return null;
    }

    if (pageCols[colIdx].height + hNeeded > usableH) {
      if (colIdx < columns - 1) {
        colIdx++;
      } else {
        if (!forceMultiPage) {
          return null;
        }
        if (pageCols.some((c) => c.sectionIds.length > 0)) {
          flushPage();
        }
        pageCols = newCols();
        colIdx = 0;
      }
    }

    pageCols[colIdx].sectionIds.push(m.id);
    pageCols[colIdx].height += hNeeded;
  }

  if (pageCols.some((c) => c.sectionIds.length > 0)) {
    flushPage();
  }
  return { pages };
}
