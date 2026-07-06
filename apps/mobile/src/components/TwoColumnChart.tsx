import { useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import type { SongDoc, SongSection } from '@gracechords/core'
import ChordChart, { ChartSection, type ChordStyle } from './ChordChart'
import { columnMeasureKey, partitionSections } from '../lib/columnLayout'
import { useTheme } from '../theme/ThemeProvider'

// Tablet two-column mode for the chord chart. Wraps ChordChart without
// touching it: sections are measured OFFSCREEN (opacity 0, position absolute,
// no pointer events) at column width, plus one full-width single-column
// measurement, then the fill-first partition in lib/columnLayout decides the
// split. When the song fits one viewport — or the partition keeps everything
// in column 1 — this renders the exact same single <ChordChart> as ever, so
// double never shows a near-empty second column.
//
// Measured heights are memoized per (width, font scale, transpose, accidental,
// chord style, show-chords, section-labels) — every input that changes
// wrapping. Transpose is the critical one: chord widths change line wrapping
// and therefore section heights. While a re-measure is in flight the previous
// partition (or the single-column render) stays visible, so there's no flicker
// or blank frame — the layout swaps in one state flip when heights land.
//
// A song taller than two viewports scrolls as a single unit (column tops stay
// aligned); a single section taller than the viewport still scrolls. Accepted —
// two columns delay overflow, they don't eliminate it.

const CACHE_MAX = 8

type Measured = { singleH: number; heights: number[] }

type Props = {
  doc: SongDoc
  steps: number
  preferFlat: boolean
  showChords?: boolean
  showSections?: boolean
  fontScale?: number
  chordStyle?: ChordStyle
  /** Visible height available to the chart (chart area minus the header inset). */
  viewportHeight: number
}

export default function TwoColumnChart({
  doc,
  steps,
  preferFlat,
  showChords = true,
  showSections = true,
  fontScale = 1,
  chordStyle = 'letters',
  viewportHeight,
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
  const colWidth = width > 0 ? (width - columnGap) / 2 : 0

  const measureKey =
    width > 0
      ? columnMeasureKey({ width, fontScale, steps, preferFlat, chordStyle, showChords, showSections })
      : ''

  // Height cache, scoped to the current doc (a new song starts fresh).
  const cacheRef = useRef<{ doc: SongDoc; entries: Map<string, Measured> } | null>(null)
  if (!cacheRef.current || cacheRef.current.doc !== doc) {
    cacheRef.current = { doc, entries: new Map() }
  }
  const cache = cacheRef.current.entries
  const measured = measureKey ? cache.get(measureKey) : undefined

  // In-flight measurement pass: -1 marks a section not yet reported. The
  // single-column total occupies one extra slot semantically (singleH < 0).
  const passRef = useRef<{ key: string; singleH: number; heights: number[] } | null>(null)
  const [, setDone] = useState(0)

  const needMeasure = !!measureKey && !measured && sections.length > 0
  if (needMeasure && passRef.current?.key !== measureKey) {
    passRef.current = { key: measureKey, singleH: -1, heights: new Array<number>(sections.length).fill(-1) }
  }

  const finishIfComplete = () => {
    const pass = passRef.current
    if (!pass || pass.singleH < 0 || pass.heights.some((h) => h < 0)) return
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(pass.key, { singleH: pass.singleH, heights: pass.heights })
    passRef.current = null
    setDone((n) => n + 1)
  }

  const onSingleLayout = (h: number) => {
    const pass = passRef.current
    if (!pass || pass.key !== measureKey) return
    pass.singleH = h
    finishIfComplete()
  }

  const onSectionLayout = (i: number, h: number) => {
    const pass = passRef.current
    if (!pass || pass.key !== measureKey) return
    pass.heights[i] = h
    finishIfComplete()
  }

  const chartOpts = { steps, preferFlat, showChords, showSections, fontScale, chordStyle }

  const partition = measured
    ? partitionSections(measured.heights, viewportHeight, sectionGap, measured.singleH)
    : null

  const renderColumn = (colSections: SongSection[], indexOffset: number) => (
    <View style={{ flex: 1 }}>
      {colSections.map((section, j) => (
        <ChartSection key={indexOffset + j} section={section} first={j === 0} {...chartOpts} />
      ))}
    </View>
  )

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {partition?.mode === 'double' ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap }}>
          {renderColumn(sections.slice(0, partition.col2Start), 0)}
          {renderColumn(sections.slice(partition.col2Start), partition.col2Start)}
        </View>
      ) : (
        // No partition yet (still measuring) or the song fits: the untouched
        // single-column chart, byte-for-byte the baseline render.
        <ChordChart doc={doc} {...chartOpts} />
      )}

      {needMeasure && colWidth > 0 ? (
        // Keyed by measureKey so any input change REMOUNTS the pass — onLayout
        // only fires on size changes, so a remount guarantees every section
        // reports even when its height is identical under the new inputs.
        <View
          key={measureKey}
          pointerEvents="none"
          collapsable={false}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 }}
        >
          <View collapsable={false} onLayout={(e) => onSingleLayout(e.nativeEvent.layout.height)}>
            <ChordChart doc={doc} {...chartOpts} />
          </View>
          <View collapsable={false} style={{ width: colWidth }}>
            {sections.map((section, i) => (
              <View
                key={i}
                collapsable={false}
                onLayout={(e) => onSectionLayout(i, e.nativeEvent.layout.height)}
              >
                <ChartSection section={section} first {...chartOpts} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}
