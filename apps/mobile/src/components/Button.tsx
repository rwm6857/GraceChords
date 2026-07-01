import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// A theme-aware button. `primary` is the filled accent CTA (e.g. the sheet's
// "Show N songs"); `secondary` is a quieter surface button. Full-width by
// default to match the design's stacked CTAs.

export type ButtonProps = {
  title: string
  onPress?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  fullWidth?: boolean
  style?: StyleProp<ViewStyle>
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  fullWidth = true,
  style,
}: ButtonProps) {
  const t = useTheme()
  const isPrimary = variant === 'primary'
  const bg = isPrimary ? t.colors.accent : t.colors.surfaceAlt
  const fg = isPrimary ? t.colors.onAccent : t.colors.ink
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          height: 48,
          borderRadius: t.radii.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: t.spacing.lg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 }}>
        {title}
      </Text>
    </Pressable>
  )
}
