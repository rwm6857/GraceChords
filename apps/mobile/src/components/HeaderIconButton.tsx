import { Pressable } from 'react-native'
import SymbolIcon, { type SymbolIconProps } from './SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// The standard top-bar action button (the Song Viewer's 40pt tinted circle:
// surfaceAlt fill, ink glyph). Every screen's header … / share buttons render
// through here so size, color, and shape stay identical app-wide. Not glass:
// the Viewer/Performer chrome animates opacity for auto-hide, which breaks
// GlassView rendering on SDK 55 (see GlassSurface.tsx), so the one look that
// can be used everywhere is this solid circle.
export default function HeaderIconButton({
  icon,
  iconSize = 17,
  label,
  onPress,
}: {
  icon: SymbolIconProps['name']
  iconSize?: number
  label: string
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        width: 40,
        height: 40,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolIcon name={icon} size={iconSize} color={t.colors.ink} />
    </Pressable>
  )
}
