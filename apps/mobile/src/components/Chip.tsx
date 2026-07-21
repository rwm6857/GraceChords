import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'
import { useAccessibilityFlags } from '../lib/accessibilityFlags'
import SymbolIcon from './SymbolIcon'

// A pill-shaped, toggleable chip — used for the tag filters in the Filter & sort
// sheet. Selected chips fill with the accent; unselected chips are a bordered
// surface. When iOS "Differentiate Without Color" is on, a selected chip also
// shows a checkmark so selection is not conveyed by fill color alone; default
// settings render exactly as before (no icon).

export default function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string
  selected?: boolean
  onPress?: () => void
}) {
  const t = useTheme()
  const { differentiateWithoutColor } = useAccessibilityFlags()
  const showCue = selected && differentiateWithoutColor
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: showCue ? t.spacing.xs : 0,
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        borderRadius: t.radii.pill,
        backgroundColor: selected ? t.colors.accent : t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? t.colors.accent : t.colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {showCue ? (
        <SymbolIcon name="checkmark" size={13} color={t.colors.onAccent} />
      ) : null}
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          letterSpacing: -0.2,
          color: selected ? t.colors.onAccent : t.colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
