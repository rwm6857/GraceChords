import { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import type { SongDoc, SongSection } from '@gracechords/core'
import { formatInstrumental, transposeInstrumental } from '@gracechords/core'
import ChordChart, {
  CHART_CHORD_FONT_SIZE,
  ChartSection,
  type ChordStyle,
  type RenderOpts,
} from './ChordChart'
import {
  columnMeasureKey,
  planColumns,
  sampleKey,
  columnWidthFor,
  type ColumnPlan,
} from '../lib/columnLayout'
import { useTheme } from '../theme/ThemeProvider'

// Auto-fitting chart: picks the column count (up to `maxColumns`) and the font
// scale, then renders the song in balanced, reading-order columns. Wraps
// ChordChart without touching it.
//
// Sections are measured OFFSCREEN (opacity 0, position absolute, no pointer
// events) at the column width for a candidate (columns, fontScale) pass; the
// planner in lib/columnLayout consumes those heights and either asks for one
// more pass or returns the final plan. Because "fits" is monotone in font
// scale, the planner binary-searches the scale ladder — a song typically
// settles in 3–4 passes, and each pass is cached.
//
// While a search is in flight the PREVIOUS plan stays on screen, so there is no
// flicker or blank frame: the layout swaps in one state flip when the planner
// finishes. Height caches are keyed on every input that changes wrapping
// (width, columns, scale, transpose, accidental, chord style, show-chords,
// show-sections) and scoped to the current doc.

type Props = {
  doc: SongDoc
  steps: number
  preferFlat: boolean
  showChords?: boolean
  showSections?: boolean
  /** Pinned scale when the user took manual control; null = auto-fit. */
  fontScale: number | null
  chordStyle?: ChordStyle
  /** Column ceiling, already capped by columnCapacity. */
  maxColumns: number
  /** Visible chart height with the chrome showing. */
  viewportHeight: number
  /** Visible chart height once the chrome auto-hides. */
  viewportHeightChromeHidden: number
  /** Fires when the resolved plan changes (font scale readout, diagnostics). */
  onPlan?: (plan: ColumnPlan) => void
}

const INITIAL_PLAN: ColumnPlan = { columns: 1, fontScale: 1, cuts: [0], fit: 'scroll' }

export default function AutoFitChart({
  doc,
  steps,
  preferFlat,
  showChords = true,
  showSections = true,
  fontScale,
  chordStyle = 'letters',
  maxColumns,
  viewportHeight,
  viewportHeightChromeHidden,
  onPlan,
}: Props) {
  const t = useTheme()
  const [width, setWidth] = useState(0)

  // Same renderable-section filter ChordChart applies, so indices line up.
  const sections = useMemo(
    () => doc.sections.filter((section) => section.lines.length > 0),
    [doc],
  )

  // Vertical gap between stacked sections = ChartSection's non-first marginTop.
  const sectionGap = t.spacing.md
  const columnGap = t.spacing.lg

  // Longest chord-only row in the song at the current transpose/style. Drives
  // the planner's horizontal-spill guard — these rows are fixed-width monospace
  // and would wrap mid-token in a column that's too narrow.
  const maxMonoRowChars = useMemo(() => {
    let longest = 0
    if (!showChords) return 0
    for (const section of sections) {
      for (const line of section.lines) {
        if (!line.instrumental) continue
        const rows: string[] = formatInstrumental(
          transposeInstrumental(line.instrumental, steps, preferFlat, { style: chordStyle }),
        )
        for (const row of rows) longest = Math.max(longest, row.length)
      }
    }
    return longest
  }, [sections, steps, preferFlat, chordStyle, showChords])

  // Measured heights per (columns, fontScale) pass, scoped to the current doc
  // and invalidated by anything that changes wrapping.
  const invalidationKey = columnMeasureKey({
    width,
    steps,
    preferFlat,
    chordStyle,
    showChords,
    showSections,
  })
  // Bounded by construction: the map is thrown away whenever the doc or any
  // wrapping input changes, so it can never hold more than
  // (column counts x font scales) = 27 entries. No eviction needed — and none
  // wanted, since evicting a sample the search still needs would re-measure it.
  const cacheRef = useRef<{ doc: SongDoc; key: string; samples: Map<string, number[]> } | null>(null)
  if (!cacheRef.current || cacheRef.current.doc !== doc || cacheRef.current.key !== invalidationKey) {
    cacheRef.current = { doc, key: invalidationKey, samples: new Map() }
  }
  const samples = cacheRef.current.samples

  const [plan, setPlan] = useState<ColumnPlan>(INITIAL_PLAN)
  // The pass currently being measured offscreen, if any.
  const [pending, setPending] = useState<{ columns: number; fontScale: number } | null>(null)
  const [, forceStep] = useState(0)

  const step = planColumns({
    sectionCount: sections.length,
    maxColumns,
    gap: sectionGap,
    columnGap,
    contentWidth: width,
    viewportHeight,
    viewportHeightChromeHidden,
    chordFontSize: CHART_CHORD_FONT_SIZE,
    maxMonoRowChars,
    samples,
    fontScale,
  })

  // Commit the plan (or arm the next measurement pass) after render, so the
  // offscreen harness below and the visible chart never fight over a frame.
  useEffect(() => {
    if (step.kind === 'measure') {
      setPending((prev) =>
        prev && prev.columns === step.columns && prev.fontScale === step.fontScale
          ? prev
          : { columns: step.columns, fontScale: step.fontScale },
      )
      return
    }
    setPending(null)
    setPlan((prev) =>
      prev.columns === step.plan.columns &&
      prev.fontScale === step.plan.fontScale &&
      prev.fit === step.plan.fit &&
      prev.cuts.length === step.plan.cuts.length &&
      prev.cuts.every((c, i) => c === step.plan.cuts[i])
        ? prev
        : step.plan,
    )
  })

  useEffect(() => {
    if (onPlan) onPlan(plan)
  }, [onPlan, plan])

  const chartOpts = {
    steps,
    preferFlat,
    showChords,
    showSections,
    fontScale: plan.fontScale,
    chordStyle,
  }

  // Reads the cache off the ref rather than the captured `samples` so a pass
  // that lands after an invalidation writes into the live map, never a
  // discarded one.
  const onPassMeasured = (columns: number, scale: number, heights: number[]) => {
    cacheRef.current?.samples.set(sampleKey(columns, scale), heights)
    forceStep((n) => n + 1)
  }

  const columns = Math.max(1, Math.min(plan.columns, sections.length || 1))

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {columns > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap }}>
          {plan.cuts.map((start, i) => {
            const end = i + 1 < plan.cuts.length ? plan.cuts[i + 1] : sections.length
            return (
              <View key={start} style={{ flex: 1 }}>
                {sections.slice(start, end).map((section, j) => (
                  <ChartSection key={start + j} section={section} first={j === 0} {...chartOpts} />
                ))}
              </View>
            )
          })}
        </View>
      ) : (
        // One column: the untouched single-column chart, byte-for-byte the
        // baseline render (just at the planned scale).
        <ChordChart doc={doc} {...chartOpts} />
      )}

      {pending && width > 0 && sections.length > 0 ? (
        <MeasurePass
          // Keyed by the pass AND the invalidation key so any change REMOUNTS
          // it — onLayout only fires on size changes, so a remount is what
          // guarantees every section reports even when its height is identical
          // under the new inputs (e.g. re-measuring the same pass after a
          // transpose that happened not to change any height).
          key={`${invalidationKey}::${sampleKey(pending.columns, pending.fontScale)}`}
          sections={sections}
          width={columnWidthFor(width, columnGap, pending.columns)}
          opts={{ ...chartOpts, fontScale: pending.fontScale }}
          onMeasured={(heights) => onPassMeasured(pending.columns, pending.fontScale, heights)}
        />
      ) : null}
    </View>
  )
}

/** One offscreen measurement pass: every section at `width`, heights reported once. */
function MeasurePass({
  sections,
  width,
  opts,
  onMeasured,
}: {
  sections: SongSection[]
  width: number
  opts: RenderOpts
  onMeasured: (heights: number[]) => void
}) {
  const heightsRef = useRef<number[]>(new Array<number>(sections.length).fill(-1))
  const doneRef = useRef(false)

  const report = (i: number, h: number) => {
    if (doneRef.current) return
    heightsRef.current[i] = h
    if (heightsRef.current.some((v) => v < 0)) return
    doneRef.current = true
    onMeasured(heightsRef.current.slice())
  }

  return (
    <View
      pointerEvents="none"
      collapsable={false}
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0, width }}
    >
      {sections.map((section, i) => (
        <View
          key={i}
          collapsable={false}
          onLayout={(e) => report(i, e.nativeEvent.layout.height)}
        >
          <ChartSection section={section} first {...opts} />
        </View>
      ))}
    </View>
  )
}
