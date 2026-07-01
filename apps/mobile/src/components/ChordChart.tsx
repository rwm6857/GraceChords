import { Platform, Text, View } from 'react-native'
import type { SongDoc, SongLine, SongSection } from '@gracechords/core'
import {
  formatInstrumental,
  makeMonospaceChordLine,
  transposeInstrumental,
  transposeSymPrefer,
} from '@gracechords/core'
import { useTheme } from '../theme/ThemeProvider'

// Static chord chart: monospaced chord line space-padded above its lyric line
// so chords land on the right characters (core's makeMonospaceChordLine).
// Chords and section headings render in accent, lyrics in ink. Transposition
// is applied per chord symbol at render time; `steps` comes from the screen.
// The chart never wraps — the parent wraps it in a horizontal ScrollView.

export const CHART_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' })
export const CHART_FONT_SIZE = 15
export const CHART_LINE_HEIGHT = 21

type Props = {
  doc: SongDoc
  steps: number
  preferFlat: boolean
}

export default function ChordChart({ doc, steps, preferFlat }: Props) {
  return (
    <View>
      {doc.sections
        // The parser re-opens a section after an inline {instrumental} directive,
        // which can leave an empty trailing copy — skip line-less sections so no
        // stray duplicate heading renders.
        .filter((section) => section.lines.length > 0)
        .map((section, i) => (
          <ChartSection key={i} section={section} first={i === 0} steps={steps} preferFlat={preferFlat} />
        ))}
    </View>
  )
}

function ChartSection({
  section,
  first,
  steps,
  preferFlat,
}: {
  section: SongSection
  first: boolean
  steps: number
  preferFlat: boolean
}) {
  const t = useTheme()
  return (
    <View style={{ marginTop: first ? 0 : t.spacing.lg }}>
      {section.label ? (
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
        <ChartLine key={i} line={line} steps={steps} preferFlat={preferFlat} />
      ))}
    </View>
  )
}

function ChartLine({
  line,
  steps,
  preferFlat,
}: {
  line: SongLine
  steps: number
  preferFlat: boolean
}) {
  const t = useTheme()
  const mono = { fontFamily: CHART_MONO, fontSize: CHART_FONT_SIZE, lineHeight: CHART_LINE_HEIGHT }

  if (line.instrumental) {
    const rows: string[] = formatInstrumental(
      transposeInstrumental(line.instrumental, steps, preferFlat)
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
      <Text style={{ fontSize: 13.5, lineHeight: CHART_LINE_HEIGHT, fontStyle: 'italic', color: t.colors.sec }}>
        {line.comment}
      </Text>
    )
  }

  const chordLine = line.chords.length
    ? makeMonospaceChordLine(
        line.lyrics,
        line.chords.map((c) => ({ sym: transposeSymPrefer(c.sym, steps, preferFlat), index: c.index }))
      )
    : ''

  if (!chordLine && !line.lyrics) {
    return <View style={{ height: CHART_LINE_HEIGHT }} />
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
