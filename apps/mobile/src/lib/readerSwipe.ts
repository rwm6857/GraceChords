// The arithmetic behind the reader's swipe-to-change-chapter gesture, kept out
// of the component so the *feel* is a set of testable numbers rather than magic
// constants buried in a worklet (`src/components/reader/ChapterSwipe.tsx`).
//
// Every function here is a Reanimated worklet — the gesture calls them on the UI
// thread — but they are plain, dependency-free math, so `npm run test` exercises
// them headless. The `'worklet'` directive is inert outside Reanimated.

/** Commit distance: a share of the window, clamped so phones and tablets agree. */
export const THRESHOLD_FRACTION = 0.22
export const THRESHOLD_MIN = 64
export const THRESHOLD_MAX = 120

/** Drag past the threshold keeps moving, but slowed, so the notch is palpable. */
export const OVERDRAG_RATE = 0.45
export const OVERDRAG_MAX = 90

/** Rubber band at the first/last reading: short, stiff, and it never commits. */
export const END_RATE = 0.22
export const END_MAX = 44

/** A flick this fast commits even short of the distance threshold. */
export const FLICK_VELOCITY = 900
export const FLICK_MIN_FRACTION = 0.5

/** How far the page must travel for a release to change chapter. */
export function swipeThreshold(width: number): number {
  'worklet'
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, width * THRESHOLD_FRACTION))
}

/**
 * Does a drag of `raw` px head toward the NEXT reading? Dragging left travels
 * toward whatever sits to the right of the current page — the next chapter when
 * reading left-to-right, the previous one in RTL.
 */
export function isForwardDrag(raw: number, rtl: boolean): boolean {
  'worklet'
  return rtl ? raw > 0 : raw < 0
}

/**
 * How far the page actually moves for a finger displacement of `raw`.
 *
 *  • With a neighbour to go to: 1:1 up to the threshold, then slowed to
 *    `OVERDRAG_RATE` and capped — the threshold is felt as a detent rather than
 *    an invisible line.
 *  • With no neighbour (first/last reading): a short, stiff rubber band that
 *    tops out at `END_MAX`, so the wall is felt immediately.
 */
export function dragTravel(raw: number, threshold: number, hasNeighbour: boolean): number {
  'worklet'
  const magnitude = Math.abs(raw)
  const sign = raw < 0 ? -1 : 1
  if (!hasNeighbour) return sign * Math.min(END_MAX, magnitude * END_RATE)
  if (magnitude <= threshold) return raw
  return (
    sign *
    Math.min(threshold + OVERDRAG_MAX, threshold + (magnitude - threshold) * OVERDRAG_RATE)
  )
}

/**
 * Should releasing here change chapter? Either the page travelled past the
 * threshold, or it was flicked hard enough from at least halfway — a fast flick
 * reads as intent even when the finger didn't cover the distance.
 */
export function shouldCommitSwipe(travelled: number, velocityX: number, threshold: number): boolean {
  'worklet'
  if (travelled >= threshold) return true
  return Math.abs(velocityX) > FLICK_VELOCITY && travelled > threshold * FLICK_MIN_FRACTION
}

/** 0 → 1 as the page approaches the commit threshold (drives the edge chevron). */
export function swipeProgress(travelled: number, threshold: number): number {
  'worklet'
  if (travelled <= 0) return 0
  return Math.min(1, travelled / threshold)
}
