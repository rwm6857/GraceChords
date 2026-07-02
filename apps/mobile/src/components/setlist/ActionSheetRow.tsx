import { Pressable, Text, View } from 'react-native'
import SymbolIcon, { type SymbolIconProps } from '../SymbolIcon'
import { useTheme } from '../../theme/ThemeProvider'

// One tappable action row inside a setlist bottom sheet (icon + label),
// matching the reference's stacked sheet actions. `destructive` renders in
// the danger color for delete/remove actions.
export default function ActionSheetRow({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: SymbolIconProps['name']
  label: string
  onPress: () => void
  destructive?: boolean
}) {
  const t = useTheme()
  const color = destructive ? t.colors.danger : t.colors.ink
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        backgroundColor: pressed ? t.colors.border : t.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: t.colors.border,
      })}
    >
      <View style={{ width: 26, alignItems: 'center' }}>
        <SymbolIcon name={icon} size={18} color={destructive ? t.colors.danger : t.colors.accent} />
      </View>
      <Text style={{ fontSize: 15.5, fontWeight: '600', color }}>{label}</Text>
    </Pressable>
  )
}
