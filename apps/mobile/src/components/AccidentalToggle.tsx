import { Platform, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../theme/ThemeProvider'

// Accidental spelling: a concrete ♯ or ♭ (no "auto" state — the default is
// resolved from the key up-front, then the user can flip it). Session-scoped.
export type Accidental = 'sharp' | 'flat'

// Default spelling for a key: ♭ if the key is already spelled with a flat
// (e.g. Bb, Eb), otherwise ♯. Callers seed the toggle with this and let the
// user override.
export function defaultAccidental(key: string | null | undefined): Accidental {
  return key && key.includes('b') ? 'flat' : 'sharp'
}

// The boolean the chart/transpose helpers expect.
export function resolvePreferFlat(accidental: Accidental): boolean {
  return accidental === 'flat'
}

// Compact two-cell ♯/♭ control that sits inline (e.g. right-justified next to
// "Play … in"). Glyph-forward with a tiny label; the selected side fills accent.
//
// ANDROID takes the same Material 3 segmented-button treatment as SegmentedPill
// (outlined 40dp track, square interior edges with a divider, ripple), keeping
// the solid accent fill for the same measured reason — see SegmentedPill.tsx.
// These two controls sit in adjacent rows of the same sheet, so they must match.

/** MD3 segmented button: 40dp tall, so 38 between the 1dp outline. */
const ANDROID_CELL_HEIGHT = 38
const IOS_CELL_HEIGHT = 30

export default function AccidentalToggle({
  value,
  onChange,
}: {
  value: Accidental
  onChange: (v: Accidental) => void
}) {
  const t = useTheme()
  const { t: tx } = useTranslation('song')
  const isAndroid = Platform.OS === 'android'
  const cellHeight = isAndroid ? ANDROID_CELL_HEIGHT : IOS_CELL_HEIGHT
  const verticalSlop = isAndroid ? 5 : 7

  const cell = (v: Accidental, glyph: string, label: string) => {
    const selected = value === v
    const first = v === 'sharp'
    return (
      <Pressable
        onPress={() => onChange(v)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        // Material's state layer, from the platform theme. iOS ignores it.
        android_ripple={{ borderless: false, foreground: true }}
        // Minimum touch target without changing the rendered cell. Per-edge,
        // not a scalar, for the same reason as SegmentedPill: the two cells are
        // flush siblings with a 0pt gap, so symmetric slop would overlap the
        // neighbour's visible bounds and make a near-boundary tap ambiguous.
        // Interior edge gets zero; the outer edges carry the 12pt (33 + 12 = 45),
        // and there is no interactive sibling outward — just the row's label.
        hitSlop={{
          top: verticalSlop,
          bottom: verticalSlop,
          left: first ? 12 : 0,
          right: first ? 0 : 12,
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          height: cellHeight,
          paddingHorizontal: 12,
          borderRadius: isAndroid ? 0 : 8,
          backgroundColor: selected ? t.colors.accent : 'transparent',
          ...(isAndroid && !first
            ? { borderLeftWidth: 1, borderLeftColor: t.colors.border }
            : null),
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: selected
              ? t.colors.onAccent
              : isAndroid
                ? t.colors.ink
                : t.colors.sec,
          }}
        >
          {glyph}
        </Text>
      </Pressable>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: isAndroid ? 'transparent' : t.colors.surfaceAlt,
        borderRadius: isAndroid ? (ANDROID_CELL_HEIGHT + 2) / 2 : 10,
        padding: isAndroid ? 0 : 3,
        ...(isAndroid
          ? { borderWidth: 1, borderColor: t.colors.border, overflow: 'hidden' as const }
          : null),
      }}
    >
      {cell('sharp', '♯', tx('accidentals.sharps'))}
      {cell('flat', '♭', tx('accidentals.flats'))}
    </View>
  )
}
