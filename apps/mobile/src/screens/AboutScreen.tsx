import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'

// About GraceChords — reached from Settings → Support. Shows the app version +
// build (via expo-constants) and links out to the privacy policy and licenses.

const PRIVACY_URL = 'https://gracechords.com/privacy'
const LICENSES_URL = 'https://gracechords.com/licenses'

export default function AboutScreen() {
  const t = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const version = Constants.expoConfig?.version ?? '—'
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null)
  const versionLabel = build ? `${version} (${build})` : version

  return (
    <Screen edges={['top', 'left', 'right']}>
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
      >
        <Text
          style={{
            fontSize: t.typography.largeTitle.fontSize,
            fontWeight: t.typography.largeTitle.fontWeight,
            letterSpacing: t.typography.largeTitle.letterSpacing,
            color: t.colors.ink,
            paddingHorizontal: t.spacing.xs,
            paddingBottom: t.spacing.md,
          }}
        >
          About
        </Text>

        {/* App identity */}
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: t.spacing.xl, gap: t.spacing.sm }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: t.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: 0.5, color: t.colors.onAccent }}>
                GC
              </Text>
            </View>
            <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
              GraceChords
            </Text>
            <Text style={{ fontSize: 13.5, color: t.colors.sec }}>Version {versionLabel}</Text>
          </View>
        </Card>

        <SectionHeader label="LEGAL" />
        <Card>
          <ListRow
            title="Privacy Policy"
            chevron
            onPress={() => void Linking.openURL(PRIVACY_URL)}
          />
          <ListRow
            title="Acknowledgements &amp; Licenses"
            chevron
            isLast
            onPress={() => void Linking.openURL(LICENSES_URL)}
          />
        </Card>
      </ScrollView>
    </Screen>
  )
}
