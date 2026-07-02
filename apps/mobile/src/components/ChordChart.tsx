import { Platform, Text, View } from 'react-native'
import type { SongDoc, SongLine, SongSection } from '@gracechords/core'
import {
  formatChord,
  formatInstrumental,
  makeMonospaceChordLine,
  transposeInstrumental,
  transposeSymPrefer,
} from '@gracechords/core'
import { useTheme } from '../theme/ThemeProvider'

// Chord chart: monospaced chord line space-padded above its lyric line so
// chords land on the right characters (core's makeMonospaceChordLine).
// Chords and section headings render in accent, lyrics in ink. Transposition
// is applied per chord symbol at render time; `steps` comes from the screen,
// and chord style (letters/solfège) is applied AFTER transpose so alignment
// holds (padding is index-based). The chart never wraps — the parent wraps it
// in a horizontal ScrollView.

export const CHART_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })
export const CHART_FONT_SIZE = 15
export const CHART_LINE_HEIGHT = 21

export type ChordStyle = 'letters' | 'solfege'

// The parser re-opens a section after an inline {instrumental} directive,
// which can leave an empty trailing copy — skip line-less sections so no
// stray duplicate heading renders. Exported so the screen's section-jump
// chips share the same array and indices as the rendered chart.
export function visibleSections(doc: SongDoc): SongSection[] {
  return doc.sections.filter((section) => section.lines.length > 0)
}

type Props = {
  doc: SongDoc
  steps: number
  preferFlat: boolean
  showChords?: boolean
  showSections?: boolean
  fontScale?: number
  chordStyle?: ChordStyle
  onSectionLayout?: (index: number, y: number) => void
}

export default function ChordChart({
  doc,
  steps,
  preferFlat,
  showChords = true,
  showSections = true,
  fontScale = 1,
  chordStyle = 'letters',
  onSectionLayout,
}: Props) {
  return (
    <View>
      {visibleSections(doc).map((section, i) => (
        <View key={i} onLayout={(e) => onSectionLayout?.(i, e.nativeEvent.layout.y)}>
          <ChartSection
            section={section}
            first={i === 0}
            steps={steps}
            preferFlat={preferFlat}
            showChords={showChords}
            showSections={showSections}
            fontScale={fontScale}
            chordStyle={chordStyle}
          />
        </View>
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

function ChartLine({ line, ...opts }: RenderOpts & { line: SongLine }) {
  const t = useTheme()
  const { steps, preferFlat, showChords, fontScale, chordStyle } = opts
  const lineHeight = Math.round(CHART_LINE_HEIGHT * fontScale)
  const mono = {
    fontFamily: CHART_MONO,
    fontSize: CHART_FONT_SIZE * fontScale,
    lineHeight,
  }

  if (line.instrumental) {
    if (!showChords) return null
    const rows: string[] = formatInstrumental(
      transposeInstrumental(line.instrumental, steps, preferFlat, { style: chordStyle })
    )
    return (
      <View>
        {rows.map((row, i) => (
          <Text key={i} style={[mono, { fontWeight: '700', color: t.colors.accent }]}>
            {row}
          </Text>
        ))}
      </View>
    )
  }

  if (line.comment) {
    return (
      <Text style={{ fontSize: 13.5 * fontScale, lineHeight, fontStyle: 'italic', color: t.colors.sec }}>
        {line.comment}
      </Text>
    )
  }

  const chordLine =
    showChords && line.chords.length
      ? makeMonospaceChordLine(
          line.lyrics,
          line.chords.map((c) => ({
            sym: formatChord(transposeSymPrefer(c.sym, steps, preferFlat), { style: chordStyle }),
            index: c.index,
          }))
        )
      : ''

  if (!chordLine && !line.lyrics) {
    // Chords-only lines vanish in lyrics-only mode; genuinely blank lines
    // keep their spacing.
    if (line.chords.length && !showChords) return null
    return <View style={{ height: lineHeight }} />
  }

  return (
    <View>
      {chordLine ? (
        <Text style={[mono, { fontWeight: '700', color: t.colors.accent }]}>{chordLine}</Text>
      ) : null}
      {line.lyrics ? <Text style={[mono, { color: t.colors.ink }]}>{line.lyrics}</Text> : null}
    </View>
  )
}
