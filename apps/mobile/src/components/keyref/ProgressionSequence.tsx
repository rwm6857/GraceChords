import { ScrollView, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { chordAccessibilityLabel, chordLabel, isDiatonic } from '../../lib/keyref/render'
import type { DisplayMode, Progression, ProgressionChord } from '../../lib/keyref/types'

// A progression's chords, one line per phrase.
//
// Each phrase is its own line, which is what makes the multi-phrase progressions
// readable: `6 – 5/7 – 1 /// 2 – 4 – 5` reads as two figures rather than as six
// chords in a row.
//
// There was a bass line under each chord. It is gone: a slash chord already
// carries its bass in its own name (`D/F#`), so the row only said anything new
// on the progressions that have inversions, and on every other one it just
// repeated the chord roots.
//
// WIDTH. Every phrase is laid out inside a horizontal ScrollView, which gives
// its children unbounded width, so nothing ever truncates. In the common keys
// even the eight-chord entries fit the 343pt a 375pt phone gives; the two widest
// of them ("Descending bass", "Repentance") run a little over in the
// flat/sharp-heavy keys and scroll there, as does any phrase at a large Dynamic
// Type setting. Progressions run to twelve chords across three phrases
// ("Intense build"), which is the other reason a phrase is a line rather than a
// run.
//
// Cells are DISPLAY ONLY, deliberately. Eight 44pt-wide targets need 352pt,
// which does not exist at this width, so making them tappable would ship targets
// below the minimum; the walk-through and its replay control drive the highlight
// instead.

const CHORD_SIZE = 14
const CHIP_HEIGHT = 26
const CELL_GAP = 4

function ChordCell({
  chord,
  tonicKey,
  mode,
  active,
  t: tx,
}: {
  chord: ProgressionChord
  tonicKey: string
  mode: DisplayMode
  active: boolean
  t: (key: string, vars: Record<string, string>) => string
}) {
  const t = useTheme()
  const altered = !isDiatonic(chord)
  // A non-diatonic chord never takes the solid accent fill: it stays outlined so
  // "played now" and "not in this key" can never be confused, and its own label
  // already carries the altered spelling.
  const solid = active && !altered
  const outlined = altered || active

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={chordAccessibilityLabel(chord, tonicKey, mode, tx)}
      style={{
        height: CHIP_HEIGHT,
        paddingHorizontal: 5,
        minWidth: 28,
        borderRadius: t.radii.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: solid ? t.colors.accent : outlined ? t.colors.accentSoft : 'transparent',
        borderWidth: altered && active ? 2 : 1,
        borderColor: outlined ? t.colors.accent : 'transparent',
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: CHORD_SIZE,
          // White on Signal Blue is only ever semibold or heavier.
          fontWeight: '700',
          letterSpacing: -0.2,
          color: solid ? t.colors.onAccent : outlined ? t.colors.textAccent : t.colors.ink,
        }}
      >
        {chordLabel(chord, tonicKey, mode)}
      </Text>
    </View>
  )
}

export type ProgressionSequenceProps = {
  progression: Progression
  tonicKey: string
  mode: DisplayMode
  /** Index into the flattened chord list, or null when nothing is lit. */
  activeIndex: number | null
  t: (key: string, vars: Record<string, string>) => string
}

export default function ProgressionSequence({
  progression,
  tonicKey,
  mode,
  activeIndex,
  t: tx,
}: ProgressionSequenceProps) {
  const t = useTheme()
  let index = 0
  return (
    <View>
      {progression.phrases.map((phrase, phraseIndex) => {
        const start = index
        index += phrase.chords.length
        return (
          <ScrollView
            key={phraseIndex}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: phraseIndex === 0 ? 0 : t.spacing.xs }}
            contentContainerStyle={{
              flexDirection: 'row',
              gap: CELL_GAP,
              alignItems: 'center',
              paddingRight: t.spacing.lg,
            }}
          >
            {phrase.chords.map((chord, i) => (
              <ChordCell
                key={`${phraseIndex}-${i}`}
                chord={chord}
                tonicKey={tonicKey}
                mode={mode}
                active={activeIndex === start + i}
                t={tx}
              />
            ))}
          </ScrollView>
        )
      })}
    </View>
  )
}
