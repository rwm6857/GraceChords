import { useWindowDimensions } from 'react-native'
import { TABLET_MIN_DIMENSION } from './columnCapacity'

// Tablet-width gate for regular-width layouts. Uses the SMALLER window
// dimension so the answer is orientation-independent: iPads (min dimension
// ≥ 744pt, down to the mini) qualify in both orientations, while phones —
// including a landscape Pro Max (min dimension ~440pt) — never do.
//
// The threshold itself lives in columnCapacity (RN-free, so it can be
// unit-tested) and is re-exported here for existing importers.
export { TABLET_MIN_DIMENSION }

export function useIsTabletWidth(): boolean {
  const { width, height } = useWindowDimensions()
  return Math.min(width, height) >= TABLET_MIN_DIMENSION
}
