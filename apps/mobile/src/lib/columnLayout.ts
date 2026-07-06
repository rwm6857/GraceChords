// Two-column layout math for the Song Viewer / Performer tablet mode. Pure and
// RN-free so the partition rules are unit-testable headless.
//
// Fill-first, NOT balanced: whole sections pack into column 1 until the next
// one would exceed the viewport, then everything remaining flows to column 2.
// Columns are top-aligned and intentionally unequal — no balancing, no
// bin-packing. Sections are atomic (the parser's section boundary is the unit)
// and are never split.

export type ColumnPartition =
  | { mode: 'single' }
  /** Sections [0, col2Start) render in column 1; [col2Start, n) in column 2. */
  | { mode: 'double'; col2Start: number }

/**
 * Greedy O(n) fill-first partition over measured section heights.
 *
 * `singleHeight` is the song's total height rendered single-column at full
 * width: double only engages when that overflows the viewport, so a song that
 * fits in one screen stays single even with double selected (never a
 * near-empty second column). `heights` are the per-section heights measured at
 * COLUMN width (narrower → taller, so they can't be reused from the
 * single-column render). `gap` is the vertical space between stacked sections.
 */
export function partitionSections(
  heights: number[],
  viewportHeight: number,
  gap: number,
  singleHeight: number,
): ColumnPartition {
  const n = heights.length
  // Nothing to split, an unmeasurable viewport, or a song that fits in one
  // viewport as-is: stay single.
  if (n <= 1 || viewportHeight <= 0) return { mode: 'single' }
  if (singleHeight <= viewportHeight) return { mode: 'single' }

  let colH = 0
  for (let i = 0; i < n; i++) {
    const add = i === 0 ? heights[i] : gap + heights[i]
    // An oversized first section still anchors column 1 (it scrolls; two
    // columns delay overflow, they don't eliminate it) — only break once
    // column 1 has at least one section.
    if (i > 0 && colH + add > viewportHeight) {
      return { mode: 'double', col2Start: i }
    }
    colH += add
  }
  // Everything fit in one column at column width.
  return { mode: 'single' }
}

export type MeasureInputs = {
  /** Available content width (drives wrapping, and column width with it). */
  width: number
  fontScale: number
  /** Transpose steps — chord widths change wrapping, so heights must invalidate. */
  steps: number
  preferFlat: boolean
  chordStyle: string
  showChords: boolean
  showSections: boolean
}

/**
 * Cache key for measured section heights. Every input that can change a
 * section's rendered height is included — transpose, chord style, accidentals,
 * and the show-chords/show-sections toggles all alter wrapping or remove rows,
 * not just the (width, fontSize) pair.
 */
export function columnMeasureKey(i: MeasureInputs): string {
  return [
    i.width,
    i.fontScale,
    i.steps,
    i.preferFlat ? 1 : 0,
    i.chordStyle,
    i.showChords ? 1 : 0,
    i.showSections ? 1 : 0,
  ].join('|')
}
