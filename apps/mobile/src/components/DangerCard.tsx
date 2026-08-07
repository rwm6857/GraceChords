import { Pressable, Text } from 'react-native'
import Card from './Card'
import { useTheme } from '../theme/ThemeProvider'

// A standalone destructive action card (Log out / Delete account), styled as a
// full-width centered row inside its own Card. Lives on the Account screen.
//
// React Native exposes no "destructive" accessibility trait, so the red text is
// invisible to a screen reader. `hint` carries that meaning instead — pass
// localized copy saying what the action does.

export default function DangerCard({
  label,
  onPress,
  accessibilityLabel,
  hint,
}: {
  label: string
  onPress: () => void
  accessibilityLabel?: string
  hint?: string
}) {
  const t = useTheme()
  return (
    <Card style={{ marginTop: t.spacing.lg }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={hint}
        style={({ pressed }) => ({
          paddingVertical: 13,
          alignItems: 'center',
          backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
        })}
      >
        <Text style={{ fontSize: t.typography.body.fontSize, fontWeight: '600', color: t.colors.danger }}>
          {label}
        </Text>
      </Pressable>
    </Card>
  )
}
