import { memo, useMemo } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import type { SongDoc, SongLine, SongSection } from '@gracechords/core'
import {
  formatChord,
  formatInstrumental,
  transposeInstrumental,
  transposeSymPrefer,
} from '@gracechords/core'
import { useTheme } from '../theme/ThemeProvider'

// Chord chart: lyrics render in the system SANS-SERIF face (SF Pro on iOS,
// Roboto on Android) to match the rest of the app, and wrap to the screen
// width; chords stay MONOSPACE in the accent color, stacked above the word
// they sit on (word-anchored, so no monospace-padding math and no horizontal
// scroll). Chord positions come from the parser as character indices into the
// lyric line; each is attached to the word it falls within. Transposition +
// chord style are applied per symbol at render time.

export const CHART_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })
// System sans-serif: RN falls back to the platform system font when fontFamily
// is unset, so `undefined` gives SF Pro on iOS / Roboto on Android — the same
// face the app chrome uses.
export const CHART_LYRIC_FONT = undefined
export const CHART_FONT_SIZE = 17
export const CHART_LINE_HEIGHT = 24
/** Chord row size at scale 1. Exported so the layout planner can width-test
 *  monospace chord-only rows without rendering them. */
export const CHART_CHORD_FONT_SIZE = 14
/**
 * Points pulled out from between a chord and the lyric it sits on (scaled with
 * the font). The two Texts are stacked flush, so the visible gap is pure font
 * leading — the chord's unused descent space plus the lyric's ascent-above-cap,
 * ~12pt at scale 1 — which reads as too airy for a chord that belongs to the
 * word beneath it. This tightens it by roughly a quarter. It stays inside the
 * chord's descent space (chord symbols have no descenders), so nothing clips.
 * Chord-only instrumental rows have no lyric beneath and are left alone.
 */
export const CHART_CHORD_LYRIC_TIGHTEN = 3

export type ChordStyle = 'letters' | 'solfege'

type Props = {
  doc: SongDoc
  steps: number
  preferFlat: boolean
  showChords?: boolean
  showSections?: boolean
  fontScale?: number
  chordStyle?: ChordStyle
}

function ChordChartInner({
  doc,
  steps,
  preferFlat,
  showChords = true,
  showSections = true,
  fontScale = 1,
  chordStyle = 'letters',
}: Props) {
  // The parser re-opens a section after an inline {instrumental} directive,
  // which can leave an empty trailing copy — skip line-less sections so no
  // stray duplicate heading renders.
  const sections = useMemo(() => doc.sections.filter((section) => section.lines.length > 0), [doc])
  return (
    <View>
      {sections.map((section, i) => (
        <ChartSection
          key={i}
          section={section}
          first={i === 0}
          steps={steps}
          preferFlat={preferFlat}
          showChords={showChords}
          showSections={showSections}
          fontScale={fontScale}
          chordStyle={chordStyle}
        />
      ))}
    </View>
  )
}

// Memoized all the way down. AutoFitChart re-renders this tree on every step of
// its measure/plan search — up to a dozen times for one plan on a tablet — and
// without memo each of those re-reconciles every word of the song.
const ChordChart = memo(ChordChartInner)
export default ChordChart

export type RenderOpts = {
  steps: number
  preferFlat: boolean
  showChords: boolean
  showSections: boolean
  fontScale: number
  chordStyle: ChordStyle
}

// Exported for AutoFitChart, which renders the same sections one column at a
// time (and offscreen for measurement). `first` gates the inter-section gap.
function ChartSectionInner({ section, first, ...opts }: RenderOpts & { section: SongSection; first: boolean }) {
  const t = useTheme()
  const wrap = useMemo(() => ({ marginTop: first ? 0 : t.spacing.md }), [first, t])
  const header = useMemo(
    () => ({
      fontSize: t.typography.sectionHeader.fontSize,
      fontWeight: t.typography.sectionHeader.fontWeight,
      letterSpacing: t.typography.sectionHeader.letterSpacing,
      color: t.colors.accent,
      textTransform: 'uppercase' as const,
      marginBottom: t.spacing.sm,
    }),
    [t],
  )
  return (
    <View style={wrap}>
      {section.label && opts.showSections ? <Text style={header}>{section.label}</Text> : null}
      {section.lines.map((line, i) => (
        <ChartLine key={i} line={line} {...opts} />
      ))}
    </View>
  )
}

export const ChartSection = memo(ChartSectionInner)

// A word (or trailing empty anchor) with the chord symbols that sit on it.
type WordCell = { text: string; chords: string[] }

// Attach each chord to the word it falls within; chords landing on whitespace
// or past the end attach to the next word / a trailing anchor.
function buildWordCells(
  lyrics: string,
  chords: Array<{ sym: string; index: number }>,
): WordCell[] {
  const words: { text: string; start: number; end: number }[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lyrics))) words.push({ text: m[0], start: m.index, end: m.index + m[0].length })

  const cells: WordCell[] = words.map((w) => ({ text: w.text, chords: [] }))
  const trailing: string[] = []

  for (const c of chords) {
    // The word this chord starts on, else the first word starting after it.
    let wi = words.findIndex((w) => c.index >= w.start && c.index < w.end)
    if (wi < 0) wi = words.findIndex((w) => w.start >= c.index)
    if (wi < 0) trailing.push(c.sym)
    else cells[wi].chords.push(c.sym)
  }
  if (trailing.length) cells.push({ text: '', chords: trailing })
  return cells
}

// Styles that never vary. Everything else scales with the font or the theme and
// is memoized per line below.
const staticStyles = StyleSheet.create({
  stack: { marginBottom: 2 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 2 },
})

function ChartLineInner({ line, ...opts }: RenderOpts & { line: SongLine }) {
  const t = useTheme()
  const { steps, preferFlat, showChords, fontScale, chordStyle } = opts

  // One object per (theme, fontScale) instead of ~6 fresh literals per word.
  const s = useMemo(() => {
    const lyricSize = CHART_FONT_SIZE * fontScale
    const lineHeight = Math.round(CHART_LINE_HEIGHT * fontScale)
    const chordLineHeight = Math.round(16 * fontScale)
    const lyric = {
      fontFamily: CHART_LYRIC_FONT,
      fontSize: lyricSize,
      lineHeight,
      fontWeight: '500' as const,
      color: t.colors.ink,
    }
    const chord = {
      fontFamily: CHART_MONO,
      fontSize: CHART_CHORD_FONT_SIZE * fontScale,
      lineHeight: chordLineHeight,
      fontWeight: '700' as const,
      color: t.colors.accent,
    }
    return {
      lyric,
      chord,
      // Flattened rather than a [chord, {...}] array so the style prop is one
      // stable object shared by every word in the line.
      chordOverWord: {
        ...chord,
        minHeight: chordLineHeight,
        marginBottom: -CHART_CHORD_LYRIC_TIGHTEN * fontScale,
      },
      comment: {
        fontFamily: CHART_LYRIC_FONT,
        fontSize: 14.5 * fontScale,
        lineHeight,
        fontStyle: 'italic' as const,
        color: t.colors.sec,
      },
      blank: { height: lineHeight },
      cell: { marginRight: lyricSize * 0.28 },
    }
  }, [t, fontScale])

  // Transposition + formatting are pure in these inputs, so they survive the
  // re-renders the measure/plan search causes.
  const rows = useMemo(
    () =>
      line.instrumental
        ? formatInstrumental(transposeInstrumental(line.instrumental, steps, preferFlat, { style: chordStyle }))
        : null,
    [line, steps, preferFlat, chordStyle],
  )

  const hasChords = showChords && line.chords.length > 0

  const cells = useMemo(
    () =>
      hasChords
        ? buildWordCells(
            line.lyrics,
            line.chords.map((c) => ({
              sym: formatChord(transposeSymPrefer(c.sym, steps, preferFlat), { style: chordStyle }),
              index: c.index,
            })),
          )
        : null,
    [hasChords, line, steps, preferFlat, chordStyle],
  )

  // Instrumental (chord-only) line — a row of mono chord tokens.
  if (line.instrumental) {
    if (!showChords) return null
    return (
      <View style={staticStyles.stack}>
        {rows!.map((row, i) => (
          <Text key={i} style={s.chord}>
            {row}
          </Text>
        ))}
      </View>
    )
  }

  if (line.comment) {
    return <Text style={s.comment}>{line.comment}</Text>
  }

  // Genuinely blank line keeps its spacing; a chords-only line vanishes in
  // lyrics-only mode.
  if (!line.lyrics && !hasChords) {
    if (line.chords.length && !showChords) return null
    return <View style={s.blank} />
  }

  // Lyrics with no chords (or chords hidden): plain wrapping line.
  if (!hasChords) {
    return <Text style={s.lyric}>{line.lyrics || ' '}</Text>
  }

  // Word-anchored: each cell stacks its chord(s) over the word; the row wraps.
  return (
    <View style={staticStyles.wrapRow}>
      {cells!.map((cell, i) => (
        <View key={i} style={s.cell}>
          <Text style={s.chordOverWord}>{cell.chords.join(' ') || ' '}</Text>
          {cell.text ? <Text style={s.lyric}>{cell.text}</Text> : <Text style={s.lyric}> </Text>}
        </View>
      ))}
    </View>
  )
}

const ChartLine = memo(ChartLineInner)
