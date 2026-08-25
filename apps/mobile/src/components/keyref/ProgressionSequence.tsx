import { ScrollView, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { bassLabel, chordAccessibilityLabel, chordLabel, isDiatonic } from '../../lib/keyref/render'
import type { DisplayMode, Progression, ProgressionChord } from '../../lib/keyref/types'

// The selected progression's chords with the bass note under each one.
//
// A chord and its bass are ONE CELL, stacked, rather than two independent rows.
// That is what keeps them aligned with no measurement, and it is what makes the
// multi-phrase progressions readable: each phrase is its own line with its own
// bass line beneath it, so `6 – 5/7 – 1 /// 6 – 5/7 – 1` reads as a figure played
// twice rather than as six chords in a row.
//
// The bass row is the point of the slash-chord set: those progressions are
// defined by their bass movement, and the arc structurally cannot show an
// inversion. It follows the same letters/numbers toggle as the chords.
//
// WIDTH. Eight chords at 14pt with these paddings come to 328pt in the widest
// key (Db's `6 – 1/5 – 4 – 1/3 – 6 – 1/5 – 4 – 5`), inside the 343pt a 375pt
// phone gives, so nothing scrolls in practice. Each phrase is nonetheless laid
// out inside a horizontal ScrollView, which gives its children unbounded width:
// a long progression, a large Dynamic Type setting or a future wider set scrolls
// instead of truncating, and because chord and bass share a cell they scroll
// together and cannot fall out of alignment. Phrases run to six chords and
// progressions to twelve ("Intense build"), which is the other reason a phrase
// is a line rather than a run.
//
// Cells are DISPLAY ONLY, deliberately. Eight 44pt-wide targets need 352pt,
// which does not exist at this width, so making them tappable would ship targets
// below the minimum; the walk-through and its replay control drive the highlight
// instead.

const CHORD_SIZE = 14
const BASS_SIZE = 12
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
      style={{ alignItems: 'center' }}
    >
      <View
        style={{
          paddingHorizontal: 4,
          paddingVertical: 3,
          minWidth: 28,
          borderRadius: t.radii.sm,
          alignItems: 'center',
          backgroundColor: solid
            ? t.colors.accent
            : outlined
              ? t.colors.accentSoft
              : 'transparent',
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
      <Text
        numberOfLines={1}
        style={{
          marginTop: 2,
          fontSize: BASS_SIZE,
          fontWeight: '600',
          color: active ? t.colors.textAccent : t.colors.sec,
        }}
      >
        {bassLabel(chord, tonicKey, mode)}
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
            style={{ marginTop: phraseIndex === 0 ? 0 : t.spacing.sm }}
            contentContainerStyle={{
              flexDirection: 'row',
              gap: CELL_GAP,
              alignItems: 'flex-start',
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
