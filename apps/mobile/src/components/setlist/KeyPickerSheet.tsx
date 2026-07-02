import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KEYS, normKey } from '@gracechords/core'
import BottomSheet from '../BottomSheet'
import AccidentalToggle, { type Accidental, defaultAccidental } from '../AccidentalToggle'
import { useTheme } from '../../theme/ThemeProvider'

// Flat spellings aligned to KEYS index (C, C#/Db, D, …). Used to relabel the
// grid when the ♯/♭ toggle is set to flats.
const FLAT_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// "Play this song in…" — a 4-column grid of the 12 keys with a ♯/♭ toggle
// (inline, right of the prompt) that relabels the grid between sharp and flat
// spellings; the picked spelling is what's stored as the override. The current
// key is highlighted by enharmonic equivalence. "Reset to {key}" clears the
// override so the entry follows the song's own key again.
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
  const current = currentKey ? (normKey(currentKey) as string) : null

  // Default the spelling from the current/native key; re-seed each open.
  const [accidental, setAccidental] = useState<Accidental>(() =>
    defaultAccidental(currentKey ?? nativeKey),
  )
  useEffect(() => {
    if (visible) setAccidental(defaultAccidental(currentKey ?? nativeKey))
  }, [visible, currentKey, nativeKey])

  const labels = accidental === 'flat' ? FLAT_KEYS : (KEYS as readonly string[])

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Key" closeAccessibilityLabel="Close key picker">
      <View style={{ padding: t.spacing.lg, paddingBottom: t.spacing.lg + insets.bottom, gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {songTitle ? (
            <Text style={{ flexShrink: 1, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.sec }}>
              Play {songTitle} in…
            </Text>
          ) : (
            <View />
          )}
          <AccidentalToggle value={accidental} onChange={setAccidental} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {(KEYS as readonly string[]).map((sharpKey, i) => {
            const label = labels[i]
            const selected = sharpKey === current
            return (
              <Pressable
                key={sharpKey}
                onPress={() => {
                  onPick(label)
                  onClose()
                }}
                accessibilityRole="button"
                accessibilityLabel={`Key of ${label}`}
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
                  {label}
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
            accessibilityLabel={nativeKey ? `Reset to ${nativeKey}` : 'Reset to the original key'}
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
              Reset to {nativeKey || 'original key'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </BottomSheet>
  )
}
