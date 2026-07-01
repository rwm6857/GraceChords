import { Text, View } from 'react-native'
import Screen from './Screen'
import { useTheme } from '../theme/ThemeProvider'

// A minimal stand-in for tabs that are later stages (Setlists, Daily Word). It
// establishes the large-title header so the shell reads correctly, with a quiet
// "coming soon" note in the body.

export default function Placeholder({ title }: { title: string }) {
  const t = useTheme()
  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm }}>
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: t.typography.largeTitle.letterSpacing,
            color: t.colors.ink,
          }}
        >
          {title}
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
          Coming soon
        </Text>
      </View>
    </Screen>
  )
}
