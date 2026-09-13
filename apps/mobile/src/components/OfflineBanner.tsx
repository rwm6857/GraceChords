import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeProvider'
import { useIsOnline } from '../lib/connectivity'

// A thin bar under the status bar while the device has no network.
//
// It exists to answer one question the app could not answer before: "is it me or
// is it the app?" Failures were reported per-surface ("Can't load songs"), which
// reads as a broken app when the real cause is a dead connection — and the app
// stays useful offline, so the honest message is "you're offline", not an error.
//
// Rendered at the root, above the navigator, so it never shifts a screen's own
// layout: it overlays rather than pushing content down.

export default function OfflineBanner() {
  const t = useTheme()
  const { t: tx } = useTranslation('offline')
  const insets = useSafeAreaInsets()
  const online = useIsOnline()

  if (online) return null

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingTop: insets.top,
        paddingBottom: t.spacing.xs + 2,
        paddingHorizontal: t.spacing.md,
        backgroundColor: t.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
      }}
    >
      <Text
        style={{ fontSize: 12.5, fontWeight: '600', color: t.colors.sec, textAlign: 'center' }}
        numberOfLines={2}
      >
        {tx('banner')}
      </Text>
    </View>
  )
}
