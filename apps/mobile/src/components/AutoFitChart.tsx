import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
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
  /**
   * Stable identity for the measured-height cache across mounts (a song slug).
   * Omit for content whose body can change under a fixed id — personal drafts —
   * and measurement falls back to being per-mount, as it was before.
   */
  cacheId?: string
}

const INITIAL_PLAN: ColumnPlan = { columns: 1, fontScale: 1, cuts: [0], fit: 'scroll' }

/** How long the wrapping inputs must hold still before a search restarts. */
const MEASURE_SETTLE_MS = 180

/**
 * Measured section heights, keyed by song identity + `columnMeasureKey`. This
 * used to be a per-mount ref, so the Performer threw away a whole search on
 * every Prev/Next and the Viewer did the same on every exit — up to 27 samples
 * for a three-column plan. Insertion-ordered eviction, capped, in the same
 * shape as the cap in src/lib/recents.ts.
 */
const HEIGHT_CACHE_MAX = 24
const heightCache = new Map<string, Map<string, number[]>>()

/** Per-mount fallback identity for docs with no stable id (personal drafts). */
let anonSeq = 0

function useCacheScope(cacheId: string | undefined, doc: SongDoc): string {
  const ref = useRef<{ doc: SongDoc; scope: string } | null>(null)
  if (cacheId) return cacheId
  // No stable id: behave exactly as the old per-mount ref did — a fresh scope
  // per doc, never shared, so an edited draft can't read stale heights.
  if (!ref.current || ref.current.doc !== doc) {
    ref.current = { doc, scope: `anon:${++anonSeq}` }
  }
  return ref.current.scope
}

function samplesFor(scope: string, measureKey: string): Map<string, number[]> {
  const key = `${scope}::${measureKey}`
  const hit = heightCache.get(key)
  if (hit) {
    // Refresh recency so an actively-used song is not the next one evicted.
    heightCache.delete(key)
    heightCache.set(key, hit)
    return hit
  }
  const fresh = new Map<string, number[]>()
  heightCache.set(key, fresh)
  for (const stale of [...heightCache.keys()].slice(0, Math.max(0, heightCache.size - HEIGHT_CACHE_MAX))) {
    heightCache.delete(stale)
  }
  return fresh
}

const autoFitStyles = StyleSheet.create({
  columnRow: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1 },
  offscreen: { position: 'absolute', top: 0, left: 0, opacity: 0 },
})

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
  cacheId,
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

  // Measurement runs against a SETTLED snapshot of the wrapping inputs, not the
  // live ones. Chords still re-render immediately on a transpose tap; only the
  // layout search waits for tapping to stop. Three quick ± taps used to start
  // three overlapping searches, each up to a dozen offscreen song mounts.
  const liveKey = columnMeasureKey({ width, steps, preferFlat, chordStyle, showChords, showSections })
  const [settled, setSettled] = useState(() => ({
    key: liveKey,
    width,
    steps,
    preferFlat,
    chordStyle,
    showChords,
    showSections,
  }))

  useEffect(() => {
    if (settled.key === liveKey) return
    const next = { key: liveKey, width, steps, preferFlat, chordStyle, showChords, showSections }
    // A width change is a real layout event (first measure, rotation, split
    // view), not a rapid gesture — adopt it at once so nothing is measured at a
    // stale width. Only the user-driven inputs settle.
    if (settled.width !== width) {
      setSettled(next)
      return
    }
    const id = setTimeout(() => setSettled(next), MEASURE_SETTLE_MS)
    return () => clearTimeout(id)
  }, [settled, liveKey, width, steps, preferFlat, chordStyle, showChords, showSections])

  const scope = useCacheScope(cacheId, doc)
  const samples = samplesFor(scope, settled.key)

  // Longest chord-only row in the song at the SETTLED transpose/style. Drives
  // the planner's horizontal-spill guard — these rows are fixed-width monospace
  // and would wrap mid-token in a column that's too narrow. Must come from the
  // settled inputs, not the live ones, or it would disagree with the heights
  // the planner is reading out of `samples`.
  const maxMonoRowChars = useMemo(() => {
    if (!settled.showChords) return 0
    let longest = 0
    for (const section of sections) {
      for (const line of section.lines) {
        if (!line.instrumental) continue
        const rows: string[] = formatInstrumental(
          transposeInstrumental(line.instrumental, settled.steps, settled.preferFlat, {
            style: settled.chordStyle,
          }),
        )
        for (const row of rows) longest = Math.max(longest, row.length)
      }
    }
    return longest
  }, [sections, settled])

  const [plan, setPlan] = useState<ColumnPlan>(INITIAL_PLAN)
  // The pass currently being measured offscreen, if any.
  const [pending, setPending] = useState<{ columns: number; fontScale: number } | null>(null)
  const [, forceStep] = useState(0)

  const step = planColumns({
    sectionCount: sections.length,
    maxColumns,
    gap: sectionGap,
    columnGap,
    contentWidth: settled.width,
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

  // Must be stable: ChartSection and ChordChart are memoized, and a fresh
  // object here would defeat both on every step of the search below.
  const chartOpts = useMemo(
    () => ({
      steps,
      preferFlat,
      showChords,
      showSections,
      fontScale: plan.fontScale,
      chordStyle,
    }),
    [steps, preferFlat, showChords, showSections, plan.fontScale, chordStyle],
  )

  // The offscreen pass must render the SETTLED inputs, not the live ones —
  // heights measured at a newer transpose would be written under the settled
  // key and quietly corrupt the search.
  const measureOpts = useMemo(
    () =>
      pending
        ? {
            steps: settled.steps,
            preferFlat: settled.preferFlat,
            showChords: settled.showChords,
            showSections: settled.showSections,
            chordStyle: settled.chordStyle,
            fontScale: pending.fontScale,
          }
        : null,
    [settled, pending],
  )

  // `samples` is the module cache's own map for this (scope, settled key), so a
  // pass that lands late still writes under the key it was actually measured
  // at — never into a map belonging to different inputs.
  const onPassMeasured = (columns: number, scale: number, heights: number[]) => {
    samples.set(sampleKey(columns, scale), heights)
    forceStep((n) => n + 1)
  }

  const columns = Math.max(1, Math.min(plan.columns, sections.length || 1))

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {columns > 1 ? (
        <View style={[autoFitStyles.columnRow, { columnGap }]}>
          {plan.cuts.map((start, i) => {
            const end = i + 1 < plan.cuts.length ? plan.cuts[i + 1] : sections.length
            return (
              <View key={start} style={autoFitStyles.column}>
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
          key={`${settled.key}::${sampleKey(pending.columns, pending.fontScale)}`}
          sections={sections}
          width={columnWidthFor(settled.width, columnGap, pending.columns)}
          opts={measureOpts!}
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
      style={[autoFitStyles.offscreen, { width }]}
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
