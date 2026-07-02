import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Screen from '../components/Screen'
import EmptyState from '../components/EmptyState'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// Offline & downloads — reached from Settings. Stubbed for this stage: real
// offline downloads / asset persistence ship in Stage 3. Scaffolded so the
// Settings row has a destination, with no download logic wired.

export default function OfflineDownloadsScreen() {
  const t = useTheme()
  const router = useRouter()

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Settings</Text>
        </Pressable>
      </View>

      <EmptyState
        icon="arrow.down.circle"
        title="Offline downloads"
        subtitle="Save songs and readings to this device for offline use. Downloads arrive in a later update."
      />
    </Screen>
  )
}
