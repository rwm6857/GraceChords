import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KEYS, normKey } from '@gracechords/core'
import BottomSheet from '../BottomSheet'
import { useTheme } from '../../theme/ThemeProvider'

// "Play this song in…" — a 4-column grid of the 12 keys, current highlighted
// (flat spellings like "Bb" normalize to their sharp cell). Picking a key sets
// the entry's setlist-scoped override and closes; "Use native key" clears the
// override so the entry follows the song's default key again.
export default function KeyPickerSheet({
  visible,
  onClose,
  songTitle,
  currentKey,
  nativeKey,
  hasOverride,
  onPick,
}: {
  visible: boolean
  onClose: () => void
  songTitle: string | null
  currentKey: string | null
  /** The song's own key, shown on the reset row. */
  nativeKey: string | null
  /** Whether the entry currently stores an override (enables the reset row). */
  hasOverride: boolean
  onPick: (key: string | null) => void
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const keys = KEYS as readonly string[]
  const current = currentKey ? (normKey(currentKey) as string) : null

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Key" closeAccessibilityLabel="Close key picker">
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        {songTitle ? (
          <Text style={{ fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.sec }}>
            Play {songTitle} in…
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {keys.map((key) => {
            const selected = key === current
            return (
              <Pressable
                key={key}
                onPress={() => {
                  onPick(key)
                  onClose()
                }}
                accessibilityRole="button"
                accessibilityLabel={`Key of ${key}`}
                accessibilityState={{ selected }}
                style={{
                  // 4 columns with the wrap gap accounted for.
                  flexBasis: '22%',
                  flexGrow: 1,
                  height: 44,
                  borderRadius: t.radii.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? t.colors.accent : t.colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: selected ? t.colors.accent : t.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: selected ? t.colors.onAccent : t.colors.ink,
                  }}
                >
                  {key}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {hasOverride ? (
          <Pressable
            onPress={() => {
              onPick(null)
              onClose()
            }}
            accessibilityRole="button"
            accessibilityLabel="Use the song's native key"
            style={({ pressed }) => ({
              height: 44,
              borderRadius: t.radii.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? t.colors.border : t.colors.surfaceAlt,
              borderWidth: 1,
              borderColor: t.colors.border,
            })}
          >
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.colors.textAccent }}>
              Use native key{nativeKey ? ` (${nativeKey})` : ''}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  )
}
