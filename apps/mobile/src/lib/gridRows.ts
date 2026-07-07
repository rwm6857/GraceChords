// Chunk a section's items into grid rows of `columns` cells, row-major (the
// tablet Song Library grid: reading order flows left→right, then down, within
// each letter section). The final row keeps its remainder — the renderer pads
// it with empty flex cells. Never emits an empty row.
export function chunkRows<T>(items: T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns))
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}
