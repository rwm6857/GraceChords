import { useWindowDimensions } from 'react-native'

// Tablet-width gate for the two-column chart mode. Uses the SMALLER window
// dimension so the answer is orientation-independent: iPads (min dimension
// ≥ 744pt, down to the mini) qualify in both orientations, while phones —
// including a landscape Pro Max (min dimension ~440pt) — never do.
export const TABLET_MIN_DIMENSION = 600

export function useIsTabletWidth(): boolean {
  const { width, height } = useWindowDimensions()
  return Math.min(width, height) >= TABLET_MIN_DIMENSION
}
