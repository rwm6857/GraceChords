import { ScrollView, Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { bassLabel, chordAccessibilityLabel, chordLabel, isDiatonic } from '../../lib/keyref/render'
import type { DisplayMode, Progression, ProgressionChord } from '../../lib/keyref/types'

// A progression's chords with the bass note under each one.
//
// A chord and its bass are ONE CELL, stacked, rather than two independent rows.
// That is what keeps them aligned with no measurement, and it is what makes the
// multi-phrase progressions readable: each phrase is its own line with its own
// bass line beneath it, so `6 – 5/7 – 1 /// 6 – 5/7 – 1` reads as a figure played
// twice rather than as six chords in a row.
//
// The bass line is the point of the slash-chord set: those progressions are
// defined by their bass movement, and the arc structurally cannot show an
// inversion. But with a progression that has no inversions it just repeats the
// chord roots, so its purpose is invisible until you happen to pick a slash-chord
// one — hence the leading label. It is drawn once, on the first phrase, and the
// gutter is reserved on the rest so cells stay left-aligned down the block.
//
// WIDTH. Eight chords at 14pt come to 328pt in the widest key (Db's
// `6 – 1/5 – 4 – 1/3 – 6 – 1/5 – 4 – 5`), and the gutter adds 34, which pushes
// that one row past the 343pt a 375pt phone gives. Each phrase is therefore laid
// out inside a horizontal ScrollView, which gives its children unbounded width:
// the widest rows, a large Dynamic Type setting, and any future wider set scroll
// instead of truncating, and because chord and bass share a cell they scroll
// together and cannot fall out of alignment. Progressions run to twelve chords
// across three phrases ("Intense build"), which is the other reason a phrase is
// a line rather than a run.
//
// Cells are DISPLAY ONLY, deliberately. Eight 44pt-wide targets need 352pt,
// which does not exist at this width, so making them tappable would ship targets
// below the minimum; the walk-through and its replay control drive the highlight
// instead.

const CHORD_SIZE = 14
const BASS_SIZE = 12
const BASS_LINE = 15
const CHIP_HEIGHT = 24
const CELL_GAP = 4
/**
 * Leading label column. Fixed so the chord and bass lines cannot drift apart,
 * and wide enough for the longest translation of the label (ko "베이스", three
 * full-width glyphs at 9.5pt).
 */
const GUTTER = 30
const GUTTER_GAP = 4

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
          height: CHIP_HEIGHT,
          paddingHorizontal: 4,
          minWidth: 28,
          borderRadius: t.radii.sm,
          alignItems: 'center',
          justifyContent: 'center',
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
          lineHeight: BASS_LINE,
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
  /** Localized label for the bass line ("bass"). */
  bassRowLabel: string
  t: (key: string, vars: Record<string, string>) => string
}

export default function ProgressionSequence({
  progression,
  tonicKey,
  mode,
  activeIndex,
  bassRowLabel,
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
          <View
            key={phraseIndex}
            style={{
              flexDirection: 'row',
              marginTop: phraseIndex === 0 ? 0 : t.spacing.sm,
            }}
          >
            {/* Labels the line it sits on; reserved but blank after the first
                phrase so every phrase's cells start at the same x. */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: GUTTER, marginRight: GUTTER_GAP }}
            >
              <View style={{ height: CHIP_HEIGHT }} />
              {phraseIndex === 0 ? (
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontSize: 9.5,
                    lineHeight: BASS_LINE,
                    fontWeight: '600',
                    letterSpacing: 0.3,
                    color: t.colors.muted,
                  }}
                >
                  {bassRowLabel}
                </Text>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
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
          </View>
        )
      })}
    </View>
  )
}
