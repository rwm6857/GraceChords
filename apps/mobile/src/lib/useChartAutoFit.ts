import { useCallback, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import { maxColumnsFor, type ColumnCount } from './columnCapacity'
import { setColumns, useColumns } from './viewerPrefs'
import type { ColumnPlan } from './columnLayout'

// Everything the Song Viewer and the Setlist Performer need to drive
// AutoFitChart. Both screens lay the chart out identically (edge-to-edge
// ScrollView under a floating, auto-hiding header), so the wiring lives here
// once instead of being duplicated and drifting.

type Args = {
  /** Measured height of the chart area (inside the screen's safe area). */
  chartAreaH: number
  /** Measured height of the floating header overlay. */
  headerH: number
  /** Horizontal padding applied on each side of the chart. */
  horizontalPadding: number
  /** Horizontal gap between columns. */
  columnGap: number
  /** Vertical breathing room between the header and the first line. */
  topGap: number
  /** Whether the auto-hiding chrome is currently showing. */
  chromeVisible: boolean
}

export type ChartAutoFit = {
  /** Column ceiling in effect (user preference capped by device/viewport). */
  columns: ColumnCount
  /** How many columns this device/viewport can carry at all. */
  maxColumns: ColumnCount
  setColumns: (v: ColumnCount) => void
  /** Pinned scale for AutoFitChart — null while auto-fit owns the size. */
  fontScale: number | null
  /** The scale actually on screen, for the View-options readout. */
  effectiveFontScale: number
  /** True while auto-fit owns the size. */
  fontAuto: boolean
  /** A−/A+ handler: hands size control to the user for the rest of the session. */
  onFontScale: (v: number) => void
  onPlan: (plan: ColumnPlan) => void
  viewportHeight: number
  viewportHeightChromeHidden: number
  /** Top inset for the scroll content. */
  paddingTop: number
}

export function useChartAutoFit({
  chartAreaH,
  headerH,
  horizontalPadding,
  columnGap,
  topGap,
  chromeVisible,
}: Args): ChartAutoFit {
  const { width, height } = useWindowDimensions()
  const contentWidth = Math.max(0, width - horizontalPadding * 2)
  const maxColumns = maxColumnsFor(Math.min(width, height), contentWidth, columnGap)
  const preferred = useColumns()
  const columns = Math.min(preferred, maxColumns) as ColumnCount

  // Auto-fit owns the size until the user touches A−/A+, after which their
  // choice sticks for the rest of the session — including across songs in a
  // set, so a deliberate size doesn't get overridden at every song change.
  const [manualScale, setManualScale] = useState<number | null>(null)
  const [plan, setPlan] = useState<ColumnPlan | null>(null)
  const onPlan = useCallback((next: ColumnPlan) => setPlan(next), [])

  // The header floats over the chart, so hiding the chrome gives the whole
  // chart area back. Only reclaim it when the plan actually needs it —
  // otherwise the content would shift on every idle/reveal cycle.
  const needsChromeHidden = plan?.fit === 'chromeHidden'
  const paddingTop = needsChromeHidden && !chromeVisible ? topGap : headerH + topGap

  return {
    columns,
    maxColumns,
    setColumns,
    fontScale: manualScale,
    effectiveFontScale: manualScale ?? plan?.fontScale ?? 1,
    fontAuto: manualScale == null,
    onFontScale: setManualScale,
    onPlan,
    viewportHeight: Math.max(0, chartAreaH - headerH - topGap),
    viewportHeightChromeHidden: Math.max(0, chartAreaH - topGap),
    paddingTop,
  }
}
