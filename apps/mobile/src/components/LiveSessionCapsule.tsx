import { Pressable, Text, View } from 'react-native'
import { useGlobalSearchParams, useRouter, useSegments } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import GlassSurface from './GlassSurface'
import { useTheme } from '../theme/ThemeProvider'
import { useIsOnline } from '../lib/connectivity'
import { sourceRoute } from '../lib/liveSession'
import { showLiveSessionMenu, useLiveSession } from '../lib/useLiveSession'

// "You're still live" — a small tappable capsule under the status bar, in the
// spot iOS uses for its own in-call / recording indicator. Rendered at the root
// (after the navigator) so it shows on whatever screen the leader lands on after
// leaving the song or set that leads the session; tapping it goes back there.
//
// It hides where it would be redundant or wrong: on the session's own source
// screen (its header button already says LIVE), the follower, auth/intro, and
// while the shared formSheet route is up.

const HIDDEN_SEGMENTS = new Set(['session', 'login', 'forgot-password', 'intro', 'choose-icon', 'sheet'])
// OfflineBanner is a single 12.5pt line under the status bar; sit below it.
const OFFLINE_BANNER_H = 24
// On notch / Dynamic Island phones the top inset ends ~14pt below the cutout,
// leaving a gap above each screen's header row; tuck the capsule into it so it
// doesn't sit on headers (e.g. Home's wordmark). Shorter insets (no cutout)
// have no gap, so the capsule sits just under the status bar instead.
const CUTOUT_INSET_MIN = 44
const CUTOUT_TUCK = 13

export default function LiveSessionCapsule() {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist', 'common'])
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const segments = useSegments() as string[]
  const params = useGlobalSearchParams<{ id?: string; slug?: string }>()
  const online = useIsOnline()
  const { active } = useLiveSession()

  if (!active) return null
  const seg = segments[0]
  if (seg && HIDDEN_SEGMENTS.has(seg)) return null
  const source = active.source
  if (source?.kind === 'set' && seg === 'perform' && params.id === source.setlistId) return null
  if (source?.kind === 'song' && seg === 'viewer' && params.slug === source.slug) return null

  const detail = active.label || tx('setlist:session.capsuleReturn')
  const onPress = () => {
    if (source) router.push(sourceRoute(source) as never)
    else showLiveSessionMenu(tx)
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: online
          ? insets.top >= CUTOUT_INSET_MIN
            ? insets.top - CUTOUT_TUCK
            : insets.top + 2
          : insets.top + OFFLINE_BANNER_H,
        left: 0,
        right: 0,
        zIndex: 1001,
        alignItems: 'center',
      }}
    >
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={tx('setlist:session.capsuleA11y')}
        style={{ maxWidth: '62%' }}
      >
        <GlassSurface
          fallbackColor={t.colors.surface}
          isInteractive
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 3,
            paddingHorizontal: 12,
            borderRadius: t.radii.pill,
            borderWidth: 1,
            borderColor: t.colors.border,
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.accent }} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.colors.accent }}>
            {tx('setlist:session.live')}
          </Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: '500', color: t.colors.ink }}>
            · {detail}
          </Text>
        </GlassSurface>
      </Pressable>
    </View>
  )
}
