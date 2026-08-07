import { View } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'
import SymbolIcon, { type SymbolIconProps } from './SymbolIcon'

// The rounded leading icon chip on grouped settings rows. Shared by the
// Profile & Settings and Account screens.

export default function RowIcon({ name }: { name: SymbolIconProps['name'] }) {
  const t = useTheme()
  return (
    <View
      style={{
        width: 29,
        height: 29,
        borderRadius: 7,
        backgroundColor: t.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SymbolIcon name={name} size={16} color={t.colors.accent} />
    </View>
  )
}
