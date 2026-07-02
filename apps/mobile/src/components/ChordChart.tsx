import { Platform, Text, View } from 'react-native'
import type { SongDoc, SongLine, SongSection } from '@gracechords/core'
import {
  formatChord,
  formatInstrumental,
  transposeInstrumental,
  transposeSymPrefer,
} from '@gracechords/core'
import { useTheme } from '../theme/ThemeProvider'

// Chord chart: lyrics render in a proportional SERIF face and wrap to the
// screen width; chords stay MONOSPACE in the accent color, stacked above the
// word they sit on (word-anchored, so no monospace-padding math and no
// horizontal scroll). Chord positions come from the parser as character
// indices into the lyric line; each is attached to the word it falls within.
// Transposition + chord style are applied per symbol at render time.

export const CHART_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })
// System serif on iOS (Georgia is always present); "serif" elsewhere.
export const CHART_SERIF = Platform.select({ ios: 'Georgia', default: 'serif' })
export const CHART_FONT_SIZE = 17
export const CHART_LINE_HEIGHT = 24

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

export default function ChordChart({
  doc,
  steps,
  preferFlat,
  showChords = true,
  showSections = true,
  fontScale = 1,
  chordStyle = 'letters',
}: Props) {
  return (
    <View>
      {doc.sections
        // The parser re-opens a section after an inline {instrumental} directive,
        // which can leave an empty trailing copy — skip line-less sections so no
        // stray duplicate heading renders.
        .filter((section) => section.lines.length > 0)
        .map((section, i) => (
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

type RenderOpts = {
  steps: number
  preferFlat: boolean
  showChords: boolean
  showSections: boolean
  fontScale: number
  chordStyle: ChordStyle
}

function ChartSection({ section, first, ...opts }: RenderOpts & { section: SongSection; first: boolean }) {
  const t = useTheme()
  return (
    <View style={{ marginTop: first ? 0 : t.spacing.lg }}>
      {section.label && opts.showSections ? (
        <Text
          style={{
            fontSize: t.typography.sectionHeader.fontSize,
            fontWeight: t.typography.sectionHeader.fontWeight,
            letterSpacing: t.typography.sectionHeader.letterSpacing,
            color: t.colors.accent,
            textTransform: 'uppercase',
            marginBottom: t.spacing.sm,
          }}
        >
          {section.label}
        </Text>
      ) : null}
      {section.lines.map((line, i) => (
        <ChartLine key={i} line={line} {...opts} />
      ))}
    </View>
  )
}

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

function ChartLine({ line, ...opts }: RenderOpts & { line: SongLine }) {
  const t = useTheme()
  const { steps, preferFlat, showChords, fontScale, chordStyle } = opts
  const lyricSize = CHART_FONT_SIZE * fontScale
  const lineHeight = Math.round(CHART_LINE_HEIGHT * fontScale)
  const chordSize = 14 * fontScale
  const chordLineHeight = Math.round(20 * fontScale)

  const serif = { fontFamily: CHART_SERIF, fontSize: lyricSize, lineHeight, color: t.colors.ink }
  const chordStyleObj = {
    fontFamily: CHART_MONO,
    fontSize: chordSize,
    lineHeight: chordLineHeight,
    fontWeight: '700' as const,
    color: t.colors.accent,
  }

  // Instrumental (chord-only) line — a row of mono chord tokens.
  if (line.instrumental) {
    if (!showChords) return null
    const rows: string[] = formatInstrumental(
      transposeInstrumental(line.instrumental, steps, preferFlat, { style: chordStyle }),
    )
    return (
      <View style={{ marginBottom: 2 }}>
        {rows.map((row, i) => (
          <Text key={i} style={chordStyleObj}>
            {row}
          </Text>
        ))}
      </View>
    )
  }

  if (line.comment) {
    return (
      <Text style={{ fontFamily: CHART_SERIF, fontSize: 14.5 * fontScale, lineHeight, fontStyle: 'italic', color: t.colors.sec }}>
        {line.comment}
      </Text>
    )
  }

  const hasChords = showChords && line.chords.length > 0

  // Genuinely blank line keeps its spacing; a chords-only line vanishes in
  // lyrics-only mode.
  if (!line.lyrics && !hasChords) {
    if (line.chords.length && !showChords) return null
    return <View style={{ height: lineHeight }} />
  }

  // Lyrics with no chords (or chords hidden): plain wrapping serif line.
  if (!hasChords) {
    return <Text style={serif}>{line.lyrics || ' '}</Text>
  }

  const cells = buildWordCells(
    line.lyrics,
    line.chords.map((c) => ({
      sym: formatChord(transposeSymPrefer(c.sym, steps, preferFlat), { style: chordStyle }),
      index: c.index,
    })),
  )

  // Word-anchored: each cell stacks its chord(s) over the word; the row wraps.
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 2 }}>
      {cells.map((cell, i) => (
        <View key={i} style={{ marginRight: lyricSize * 0.28 }}>
          <Text style={[chordStyleObj, { minHeight: chordLineHeight }]}>
            {cell.chords.join(' ') || ' '}
          </Text>
          {cell.text ? <Text style={serif}>{cell.text}</Text> : <Text style={serif}> </Text>}
        </View>
      ))}
    </View>
  )
}
