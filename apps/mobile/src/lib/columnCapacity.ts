// How many chart columns a device/viewport can carry. Pure and RN-free so the
// caps are unit-testable headless (same shape as columnLayout.ts); the hook
// that feeds it live dimensions lives in useChartAutoFit.
//
// This is a CEILING, not a target: the layout planner in columnLayout.ts is
// free to use fewer columns when fewer give bigger text. See viewerPrefs for
// the user's own ceiling, which is min()'d with this one.

export type ColumnCount = 1 | 2 | 3

/**
 * Tablet threshold on the SMALLER window dimension, so the answer is
 * orientation-independent: iPads (min dimension ≥ 744pt, down to the mini)
 * qualify in both orientations, while phones — including a landscape Pro Max
 * (min dimension ~440pt) — never do. Shared with useIsTabletWidth.
 */
export const TABLET_MIN_DIMENSION = 600

/**
 * Narrowest a chart column may get, in points at font scale 1. Below this,
 * lyric lines wrap so hard that the extra column costs more than it saves.
 */
export const MIN_COLUMN_WIDTH = 300

/**
 * Device tier boundary between "2 columns is plenty" and "3 columns is
 * usable", on the same smaller-dimension basis as TABLET_MIN_DIMENSION. An
 * iPad mini's min dimension is 744pt and stays at 2; an 11" iPad (820pt) and
 * up can reach 3.
 */
export const THREE_COLUMN_MIN_DIMENSION = 800

/**
 * Two independent caps, whichever is tighter:
 *
 * 1. Device tier from `minDimension` — phones 1, small tablets 2, larger 3.
 * 2. Width fit — how many MIN_COLUMN_WIDTH columns (plus gaps) actually fit in
 *    `contentWidth`. This is what keeps an 11" iPad at 2 columns in portrait
 *    and lets it reach 3 in landscape, without hardcoding device sizes.
 *
 * `contentWidth <= 0` (not laid out yet) falls back to the device tier alone,
 * so the first frame doesn't collapse to 1 and then jump.
 */
export function maxColumnsFor(
  minDimension: number,
  contentWidth: number,
  gap: number,
): ColumnCount {
  if (minDimension < TABLET_MIN_DIMENSION) return 1
  const tier: ColumnCount = minDimension < THREE_COLUMN_MIN_DIMENSION ? 2 : 3
  if (contentWidth <= 0) return tier
  const byWidth = Math.floor((contentWidth + gap) / (MIN_COLUMN_WIDTH + gap))
  return Math.max(1, Math.min(tier, byWidth)) as ColumnCount
}
