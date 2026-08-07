// Column + font-size layout planning for the Song Viewer / Performer chart.
// Pure and RN-free so every rule here is unit-testable headless.
//
// The goal is hands-free live use: given a column CEILING, fit the whole song
// on one screen at the largest readable font, and only fall back to scrolling
// when nothing fits. Three tiers, in order:
//
//   1. fits with the header/chrome visible               → 'chrome'
//   2. fits once the chrome auto-hides (reclaims the top) → 'chromeHidden'
//   3. nothing fits — balance columns for the least scroll → 'scroll'
//
// Within a tier we prefer the LARGEST font, tie-broken by the FEWEST columns.
// That is what makes the 1/2/3 picker a ceiling rather than a target: a short
// song set to "3" renders as one big column instead of three near-empty ones.
//
// Packing is ORDERED and BALANCED: sections stay atomic and in reading order
// (down column 1, then 2, then 3), and the split minimizes the TALLEST column.
// The previous fill-first rule broke at the first section that overflowed,
// which stranded most of column 1 whenever an early section was tall.

export type ColumnPlan = {
  /** Columns actually used — 1..maxColumns, never more than there are sections. */
  columns: number
  fontScale: number
  /** Start section index per column; length === columns, cuts[0] === 0. */
  cuts: number[]
  fit: 'chrome' | 'chromeHidden' | 'scroll'
}

/** Font-scale ladder, matching ViewOptionsSheet's manual MIN/MAX/STEP. */
export const FONT_SCALES = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6] as const

/**
 * Scale used when nothing fits at any size (tier 3). Shrinking further would
 * buy a little less scrolling at a real cost in readability, so we stop at the
 * comfortable default and let the balanced packing do the work instead.
 */
export const FALLBACK_SCALE = 1.0

/** Monospace advance width as a fraction of font size (Menlo ≈ 0.6em). */
export const MONO_ADVANCE = 0.6
/** Leave a little slack so a borderline row doesn't wrap on rounding. */
const MONO_SAFETY = 0.96

// ---------------------------------------------------------------------------
// Ordered balanced packing
// ---------------------------------------------------------------------------

function prefixSums(heights: number[]): number[] {
  const out = new Array<number>(heights.length + 1)
  out[0] = 0
  for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + heights[i]
  return out
}

/** Stacked height of sections [a, b), including the gaps between them. */
function runHeight(prefix: number[], gap: number, a: number, b: number): number {
  if (b <= a) return 0
  return prefix[b] - prefix[a] + gap * (b - a - 1)
}

/**
 * Ordered partition of `heights` into `k` columns that MINIMIZES the tallest
 * column (the classic linear-partition / minimize-the-maximum problem, solved
 * exactly by DP — `n` is a song's section count, so the O(k·n²) cost is
 * nothing). Sections are never split or reordered.
 *
 * Because it minimizes the max, `maxHeight <= limit` is also the exact
 * feasibility test for "does this song fit in k columns of height limit" — one
 * function answers both "does it fit" and "where are the nicest cuts".
 *
 * `k` is clamped to `heights.length`, so asking for more columns than there
 * are sections collapses instead of leaving empty columns.
 */
export function packOrdered(
  heights: number[],
  gap: number,
  k: number,
): { cuts: number[]; maxHeight: number } {
  const n = heights.length
  if (n === 0) return { cuts: [0], maxHeight: 0 }
  const columns = Math.max(1, Math.min(Math.floor(k), n))
  const prefix = prefixSums(heights)
  if (columns === 1) return { cuts: [0], maxHeight: runHeight(prefix, gap, 0, n) }

  // dp[c][i] = min achievable tallest column when the first `i` sections are
  // laid into exactly `c` non-empty columns. split[c][i] remembers where the
  // last column started.
  const INF = Number.POSITIVE_INFINITY
  const dp: number[][] = Array.from({ length: columns + 1 }, () => new Array<number>(n + 1).fill(INF))
  const split: number[][] = Array.from({ length: columns + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = 1; i <= n; i++) dp[1][i] = runHeight(prefix, gap, 0, i)

  for (let c = 2; c <= columns; c++) {
    for (let i = c; i <= n; i++) {
      // j = index the last column starts at; every column must be non-empty.
      // Iterate ascending and use `<=` so ties keep the LARGEST j, which packs
      // the earlier columns fuller — a more natural read than a trailing bias.
      for (let j = c - 1; j < i; j++) {
        if (dp[c - 1][j] === INF) continue
        const candidate = Math.max(dp[c - 1][j], runHeight(prefix, gap, j, i))
        if (candidate <= dp[c][i]) {
          dp[c][i] = candidate
          split[c][i] = j
        }
      }
    }
  }

  const cuts = new Array<number>(columns)
  let i = n
  for (let c = columns; c >= 1; c--) {
    const start = c === 1 ? 0 : split[c][i]
    cuts[c - 1] = start
    i = start
  }
  return { cuts, maxHeight: dp[columns][n] }
}

/**
 * Horizontal-spill guard. Lyric lines wrap (ChartLine uses flexWrap), but
 * chord-only rows are fixed-width monospace strings from `formatInstrumental`
 * and wrap mid-token in a narrow column. `maxRowChars` is the longest such row
 * in the song, in characters, at the current transpose/chord style.
 */
export function instrumentalFits(
  maxRowChars: number,
  colWidth: number,
  chordFontSize: number,
): boolean {
  if (maxRowChars <= 0) return true
  if (colWidth <= 0) return false
  return maxRowChars * chordFontSize * MONO_ADVANCE <= colWidth * MONO_SAFETY
}

/** Width of one column when `contentWidth` is split `columns` ways. */
export function columnWidthFor(contentWidth: number, gap: number, columns: number): number {
  if (columns <= 1) return contentWidth
  return (contentWidth - gap * (columns - 1)) / columns
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

/** Sample cache key for one measured (columns, fontScale) pass. */
export function sampleKey(columns: number, fontScale: number): string {
  return `${columns}|${fontScale}`
}

export type PlanInput = {
  sectionCount: number
  /** User's ceiling, already capped by columnCapacity. */
  maxColumns: number
  /** Vertical space between stacked sections. */
  gap: number
  /** Horizontal gap between columns. */
  columnGap: number
  contentWidth: number
  /** Usable height with the chrome visible. */
  viewportHeight: number
  /** Usable height once the chrome auto-hides (>= viewportHeight). */
  viewportHeightChromeHidden: number
  /** Base chord font size at scale 1 (ChordChart's CHART_CHORD_FONT_SIZE). */
  chordFontSize: number
  /** Longest formatted instrumental row in characters; 0 when there are none. */
  maxMonoRowChars: number
  /** Measured section heights, keyed by `sampleKey`. */
  samples: Map<string, number[]>
  /** null = auto-fit; a number pins the scale (the user took manual control). */
  fontScale: number | null
}

export type PlanStep =
  | { kind: 'measure'; columns: number; fontScale: number }
  | { kind: 'done'; plan: ColumnPlan }

/**
 * One step of the search. Returns either the next (columns, fontScale) pass to
 * measure or the final plan; the caller measures, adds the heights to
 * `samples`, and calls again. Deterministic given `samples`, so it converges
 * and is testable without a renderer.
 */
export function planColumns(input: PlanInput): PlanStep {
  const { sectionCount, gap, samples, fontScale: pinned } = input
  const maxColumns = Math.max(1, Math.min(input.maxColumns, Math.max(1, sectionCount)))

  if (sectionCount === 0) {
    return { kind: 'done', plan: { columns: 1, fontScale: pinned ?? FALLBACK_SCALE, cuts: [0], fit: 'chrome' } }
  }
  // Not laid out yet — render the plain single-column chart and re-plan once
  // real dimensions arrive.
  if (input.contentWidth <= 0 || input.viewportHeight <= 0) {
    return { kind: 'done', plan: { columns: 1, fontScale: pinned ?? FALLBACK_SCALE, cuts: [0], fit: 'scroll' } }
  }

  /** undefined = needs measuring; otherwise whether it fits within `limit`. */
  const fitsAt = (columns: number, scale: number, limit: number): boolean | undefined => {
    const colWidth = columnWidthFor(input.contentWidth, input.columnGap, columns)
    if (!instrumentalFits(input.maxMonoRowChars, colWidth, input.chordFontSize * scale)) return false
    const heights = samples.get(sampleKey(columns, scale))
    if (!heights) return undefined
    return packOrdered(heights, gap, columns).maxHeight <= limit
  }

  const finish = (columns: number, scale: number, fit: ColumnPlan['fit']): PlanStep => {
    const heights = samples.get(sampleKey(columns, scale))
    if (!heights) return { kind: 'measure', columns, fontScale: scale }
    return { kind: 'done', plan: { columns, fontScale: scale, cuts: packOrdered(heights, gap, columns).cuts, fit } }
  }

  // --- Manual font: only the column count is searched -----------------------
  if (pinned != null) {
    for (const limit of [input.viewportHeight, input.viewportHeightChromeHidden] as const) {
      const fit: ColumnPlan['fit'] = limit === input.viewportHeight ? 'chrome' : 'chromeHidden'
      for (let k = 1; k <= maxColumns; k++) {
        const f = fitsAt(k, pinned, limit)
        if (f === undefined) return { kind: 'measure', columns: k, fontScale: pinned }
        if (f) return finish(k, pinned, fit)
      }
      if (input.viewportHeightChromeHidden <= input.viewportHeight) break
    }
    return finish(maxColumns, pinned, 'scroll')
  }

  // --- Auto: largest scale wins, ties go to the fewest columns --------------
  //
  // "Fits" is monotone in scale (taller text never fits where shorter didn't),
  // so the best scale for a given column count is binary-searchable over the
  // ladder — ~4 measured passes instead of 9.
  const searchTier = (
    limit: number,
  ): { kind: 'measure'; columns: number; fontScale: number } | { columns: number; scale: number } | null => {
    let bestColumns = 0
    let bestIndex = -1
    for (let k = 1; k <= maxColumns; k++) {
      // A later (wider) column count only wins by beating the current best
      // outright — equal scale keeps the fewer columns.
      let lo = bestIndex + 1
      let hi = FONT_SCALES.length - 1
      let found = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const f = fitsAt(k, FONT_SCALES[mid], limit)
        if (f === undefined) return { kind: 'measure', columns: k, fontScale: FONT_SCALES[mid] }
        if (f) {
          found = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      if (found > bestIndex) {
        bestIndex = found
        bestColumns = k
      }
      // Already at the top of the ladder with the fewest columns — done.
      if (bestIndex === FONT_SCALES.length - 1) break
    }
    return bestIndex >= 0 ? { columns: bestColumns, scale: FONT_SCALES[bestIndex] } : null
  }

  const tier1 = searchTier(input.viewportHeight)
  if (tier1 && 'kind' in tier1) return tier1
  if (tier1) return finish(tier1.columns, tier1.scale, 'chrome')

  if (input.viewportHeightChromeHidden > input.viewportHeight) {
    const tier2 = searchTier(input.viewportHeightChromeHidden)
    if (tier2 && 'kind' in tier2) return tier2
    if (tier2) return finish(tier2.columns, tier2.scale, 'chromeHidden')
  }

  // Tier 3: nothing fits. Use as much of the ceiling as the chord rows can take
  // and balance for the least scrolling — every column shares one ScrollView,
  // so the tallest column IS the scroll distance.
  let fallbackColumns = 1
  for (let k = maxColumns; k >= 1; k--) {
    const colWidth = columnWidthFor(input.contentWidth, input.columnGap, k)
    if (instrumentalFits(input.maxMonoRowChars, colWidth, input.chordFontSize * FALLBACK_SCALE)) {
      fallbackColumns = k
      break
    }
  }
  return finish(fallbackColumns, FALLBACK_SCALE, 'scroll')
}

// ---------------------------------------------------------------------------
// Measurement cache key
// ---------------------------------------------------------------------------

export type MeasureInputs = {
  /** Available content width (drives wrapping, and column width with it). */
  width: number
  /** Transpose steps — chord widths change wrapping, so heights must invalidate. */
  steps: number
  preferFlat: boolean
  chordStyle: string
  showChords: boolean
  showSections: boolean
}

/**
 * Invalidation key for the whole sample cache. Every input that can change a
 * section's rendered height is included — transpose, chord style, accidentals,
 * and the show-chords/show-sections toggles all alter wrapping or remove rows.
 * The per-pass (columns, fontScale) pair is NOT here; it lives in `sampleKey`,
 * because those two vary within one search rather than invalidating it.
 */
export function columnMeasureKey(i: MeasureInputs): string {
  return [
    i.width,
    i.steps,
    i.preferFlat ? 1 : 0,
    i.chordStyle,
    i.showChords ? 1 : 0,
    i.showSections ? 1 : 0,
  ].join('|')
}
