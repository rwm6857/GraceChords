import { Pressable, Text } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// A pill-shaped, toggleable chip — used for the tag filters in the Filter & sort
// sheet. Selected chips fill with the accent; unselected chips are a bordered
// surface.

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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        paddingVertical: t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        borderRadius: t.radii.pill,
        backgroundColor: selected ? t.colors.accent : t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? t.colors.accent : t.colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
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
