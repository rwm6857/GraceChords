import { Pressable, Text, View } from 'react-native'
import SymbolIcon from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// Floating transpose pill: key-down / current key / key-up. Dumb component —
// the screen owns the transpose state and haptics; the parent positions this
// absolutely above the chart. Token surface + border instead of the mockup's
// blur (no expo-blur dep; HIG-fine).

export default function TransposeBar({
  keyLabel,
  onDown,
  onUp,
  onLongPress,
}: {
  keyLabel: string
  onDown: () => void
  onUp: () => void
  // Long-press the center key label to open the key selector. Optional so the
  // bar still works where no picker is wired.
  onLongPress?: () => void
}) {
  const t = useTheme()
  const buttonStyle = {
    width: 46,
    height: 44,
    borderRadius: 11,
    backgroundColor: t.colors.surfaceAlt,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 16,
        backgroundColor: t.colors.surface,
        borderWidth: 1,
        borderColor: t.colors.border,
        shadowColor: t.colors.ink,
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      <Pressable
        onPress={onDown}
        accessibilityRole="button"
        accessibilityLabel="Transpose down"
        style={({ pressed }) => [buttonStyle, pressed && { opacity: 0.6 }]}
      >
        <SymbolIcon name="chevron.down" size={20} color={t.colors.accent} weight="semibold" />
      </Pressable>
      <Pressable
        onLongPress={onLongPress}
        disabled={!onLongPress}
        accessibilityRole="button"
        accessibilityLabel="Choose key"
        accessibilityHint="Opens the key selector"
        style={({ pressed }) => [pressed && onLongPress ? { opacity: 0.6 } : null]}
      >
        <Text
          style={{
            minWidth: 48,
            textAlign: 'center',
            fontSize: 24,
            fontWeight: '700',
            color: t.colors.ink,
          }}
        >
          {keyLabel}
        </Text>
      </Pressable>
      <Pressable
        onPress={onUp}
        accessibilityRole="button"
        accessibilityLabel="Transpose up"
        style={({ pressed }) => [buttonStyle, pressed && { opacity: 0.6 }]}
      >
        <SymbolIcon name="chevron.up" size={20} color={t.colors.accent} weight="semibold" />
      </Pressable>
    </View>
  )
}
