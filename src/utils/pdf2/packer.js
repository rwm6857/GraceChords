// Column packing used by pdf2. The legacy engine has its own layout
// routines; this implementation exists alongside it during migration.
export function packColumns(
  measured,
  { columns, pageSizePt, marginsPt, forceMultiPage }
) {
  const usableH = pageSizePt.h - marginsPt.top - marginsPt.bottom;
  if (usableH <= 0) {
    return { pages: [{ columns: Array.from({ length: columns }, () => ({ sectionIds: [], height: 0 })) }] };
  }

  const newCols = () => Array.from({ length: columns }, () => ({ sectionIds: [], height: 0 }));
  const pages = [];
  let pageCols = newCols();
  let colIdx = 0;

  for (const m of measured) {
    const hNeeded = m.height + (m.postSpacing ?? 0);

    if (pageCols[colIdx].height + hNeeded <= usableH) {
      pageCols[colIdx].sectionIds.push(m.id);
      pageCols[colIdx].height += hNeeded;
      continue;
    }

    // new column
    colIdx++;
    if (colIdx >= columns) {
      // new page
      pages.push({ columns: pageCols.map((c) => ({ ...c })) });
      pageCols = newCols();
      colIdx = 0;
    }

    if (hNeeded > usableH && !forceMultiPage) {
      return null;
    }
    pageCols[colIdx].sectionIds.push(m.id);
    pageCols[colIdx].height = hNeeded;
  }

  pages.push({ columns: pageCols.map((c) => ({ ...c })) });
  return { pages };
}
