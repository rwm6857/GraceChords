import { Alert, Pressable, Text, View } from 'react-native'
import Screen from '../../src/components/Screen'
import SymbolIcon from '../../src/components/SymbolIcon'
import { useTheme } from '../../src/theme/ThemeProvider'
import { supabase } from '../../src/lib/supabase'

// Home is a later stage — this is a placeholder that carries the app-shell
// chrome: the brand row on the left and the header avatar on the right. The
// avatar will open Profile/Settings later; for now it exposes Sign out so the
// existing auth behavior stays reachable.

export default function HomeTab() {
  const t = useTheme()

  function onAvatar() {
    Alert.alert('Account', undefined, [
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
        }}
      >
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: t.typography.largeTitle.letterSpacing,
            color: t.colors.ink,
          }}
        >
          GraceChords
        </Text>
        <Pressable
          onPress={onAvatar}
          accessibilityRole="button"
          accessibilityLabel="Account"
          hitSlop={8}
          style={{
            width: 38,
            height: 38,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SymbolIcon name="person.crop.circle" size={24} color={t.colors.accent} />
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
          Coming soon
        </Text>
      </View>
    </Screen>
  )
}
