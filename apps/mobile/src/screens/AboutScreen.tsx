import { useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import { useTheme } from '../theme/ThemeProvider'

// About GraceChords — reached from Settings → Support. Shows the app version +
// build (via expo-constants), links out to the legal pages (privacy, terms,
// licenses) and a contact mailto, and shows the copyright line.

const PRIVACY_URL = 'https://gracechords.com/privacy'
const TERMS_URL = 'https://gracechords.com/terms'
const LICENSES_URL = 'https://gracechords.com/licenses'
const CONTACT_EMAIL = 'ryan@gracechords.com'

// Matches the web app's copyright (apps/web/src/config/copyright.ts): a range
// from the first public-release year to the current year.
function copyrightRange(): string {
  const year = new Date().getFullYear()
  const base = 2023
  return year === base ? `${year}` : `${base}–${year}`
}

export default function AboutScreen() {
  const t = useTheme()
  const { t: tx } = useTranslation(['settings', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // Measured glass-bar height feeds the scroll-behind top inset so content
  // clears the bar at rest and slides under it on scroll (all versions).
  const [barH, setBarH] = useState(0)

  const version = Constants.expoConfig?.version ?? '—'
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    (Constants.expoConfig?.android?.versionCode != null
      ? String(Constants.expoConfig.android.versionCode)
      : null)
  const versionLabel = build ? `${version} (${build})` : version

  return (
    <Screen edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: barH + t.spacing.sm,
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
          {tx('about.title')}
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
            <Text style={{ fontSize: 13.5, color: t.colors.sec }}>{tx('about.version', { version: versionLabel })}</Text>
          </View>
        </Card>

        <SectionHeader label={tx('about.sectionLegal')} />
        <Card>
          <ListRow
            title={tx('about.privacyPolicy')}
            chevron
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
          />
          <ListRow
            title={tx('about.termsOfUse')}
            chevron
            onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)}
          />
          <ListRow
            title={tx('about.acknowledgements')}
            chevron
            onPress={() => void WebBrowser.openBrowserAsync(LICENSES_URL)}
          />
          <ListRow
            title={tx('about.contact')}
            chevron
            isLast
            onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
          />
        </Card>

        <Text
          style={{
            marginTop: t.spacing.xl,
            textAlign: 'center',
            fontSize: 12.5,
            color: t.colors.muted,
          }}
        >
          {tx('common:copyright', { range: copyrightRange() })}
        </Text>
      </ScrollView>

      {/* Scroll-behind top bar: Liquid Glass on iOS 26, opaque page-bg bar on
          iOS < 26 / Android. Content scrolls under it (measured via onLayout). */}
      <GlassSurface
        fallbackColor={t.colors.bg}
        fallbackHairline
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tx('common:back')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>{tx('common:settings')}</Text>
        </Pressable>
      </GlassSurface>
    </Screen>
  )
}
