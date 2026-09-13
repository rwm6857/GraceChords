import { Platform, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// A theme-aware button. `primary` is the filled accent CTA (e.g. the sheet's
// "Show N songs"); `secondary` is a quieter surface button. Full-width by
// default to match the design's stacked CTAs.
//
// ANDROID takes Material 3's filled-button shape — fully rounded (radii.pill)
// rather than a 12pt corner — and a ripple state layer instead of iOS's
// press-dim. The ripple colour is left to the platform theme
// (?attr/colorControlHighlight) so it follows light/dark by itself, which is
// also why this needs no new token.
//
// The HEIGHT deliberately stays 48 on both. MD3's filled button is 40dp, but
// that is below the 48 this design system already uses AND below Material's own
// 48dp minimum touch target; dropping Android to 40 or raising it past iOS would
// both drift the system for no gain. This is a conscious deviation from the spec.

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
  const isAndroid = Platform.OS === 'android'
  const bg = isPrimary ? t.colors.accent : t.colors.surfaceAlt
  const fg = isPrimary ? t.colors.onAccent : t.colors.ink
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // foreground:true draws the ripple ABOVE the fill, so it stays visible on
      // the filled accent variant. iOS ignores this prop entirely.
      android_ripple={disabled ? undefined : { borderless: false, foreground: true }}
      style={({ pressed }) => [
        {
          height: 48,
          borderRadius: isAndroid ? t.radii.pill : t.radii.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: t.spacing.lg,
          // Android shows the ripple instead of dimming; dimming as well would
          // read as two overlapping press effects.
          opacity: disabled ? 0.5 : isAndroid ? 1 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          overflow: isAndroid ? 'hidden' : 'visible',
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
