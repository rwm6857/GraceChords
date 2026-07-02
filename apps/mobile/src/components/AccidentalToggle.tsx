import { Pressable, Text, View } from 'react-native'
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
export default function AccidentalToggle({
  value,
  onChange,
}: {
  value: Accidental
  onChange: (v: Accidental) => void
}) {
  const t = useTheme()

  const cell = (v: Accidental, glyph: string, label: string) => {
    const selected = value === v
    return (
      <Pressable
        onPress={() => onChange(v)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          height: 30,
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: selected ? t.colors.accent : 'transparent',
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: selected ? t.colors.onAccent : t.colors.sec }}>
          {glyph}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.colors.surfaceAlt, borderRadius: 10, padding: 3 }}>
      {cell('sharp', '♯', 'Sharps')}
      {cell('flat', '♭', 'Flats')}
    </View>
  )
}
