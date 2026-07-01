import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../theme/ThemeProvider'

// A raised surface container with the theme's card radius and a hairline
// border. Used for grouped content (e.g. the placeholder screens' cards and the
// sheet's sort-option group).

export default function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderWidth: 1,
          borderColor: t.colors.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
