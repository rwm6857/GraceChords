import { Pressable, Text, View } from 'react-native'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import Screen from '../../src/components/Screen'
import SymbolIcon from '../../src/components/SymbolIcon'
import { useTheme } from '../../src/theme/ThemeProvider'

// Placeholder Song Viewer. The real chord-chart viewer is a later stage; for now
// this just confirms navigation works and echoes the tapped song. It lives
// outside the tab group and pushes full-screen over the shell.

export default function ViewerScreen() {
  const t = useTheme()
  const router = useRouter()
  const { slug, title, artist, songKey } = useLocalSearchParams<{
    slug: string
    title?: string
    artist?: string
    songKey?: string
  }>()

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>Songs</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing.xl }}>
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            color: t.colors.ink,
            textAlign: 'center',
          }}
        >
          {title ?? slug}
        </Text>
        {artist ? (
          <Text style={{ marginTop: 6, fontSize: 15, color: t.colors.sec }}>{artist}</Text>
        ) : null}
        {songKey ? (
          <Text style={{ marginTop: 10, fontSize: 14, fontWeight: '600', color: t.colors.textAccent }}>
            Key of {songKey}
          </Text>
        ) : null}
        <Text style={{ marginTop: t.spacing.xl, fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
          Song Viewer — coming soon
        </Text>
      </View>
    </Screen>
  )
}
