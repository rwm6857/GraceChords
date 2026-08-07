import { Platform, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import type { Devotional } from '@gracechords/core/devotional/types'
import SymbolIcon from '../SymbolIcon'
import { cardStyle } from '../home/cardStyle'
import { useTheme } from '../../theme/ThemeProvider'

// A devotional on the home dashboard. One card per devotional, so ~220 days show
// two — they are siblings on the day's reading, not a primary and a secondary.
//
// There is no title in the source: `coreText` (the entry's opening scripture) IS
// the title. Nothing is synthesised.
//
// Platform styling comes from one component, not two implementations. `cardStyle`
// already resolves iOS shadow vs Android elevation; the remaining difference is
// press feedback, where HIG wants a subtle opacity dip and Material wants a
// ripple bounded to the card's radius.

export default function DevotionalCard({
  devotional,
  dayKey,
}: {
  devotional: Devotional
  dayKey: string
}) {
  const t = useTheme()
  const router = useRouter()
  const { t: tx } = useTranslation('devotional')

  return (
    <Pressable
      onPress={() => router.navigate(`/devotional/${dayKey}/${devotional.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={tx('card.open', { reference: devotional.reference })}
      android_ripple={{ color: t.colors.accentSoft, borderless: false, foreground: true }}
      style={({ pressed }) => [
        cardStyle(t),
        Platform.OS === 'ios' && pressed ? { opacity: 0.6 } : null,
      ]}
    >
      {/* Eyebrow: the scripture this entry is built on. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: t.colors.textAccent,
          }}
        >
          {devotional.reference}
        </Text>
        <SymbolIcon name="chevron.right" size={13} color={t.colors.muted} />
      </View>

      {/* Title. `coreText` is the title — the source has no separate one. */}
      <Text
        style={{
          marginTop: 6,
          fontSize: 19,
          lineHeight: 19 * 1.32,
          fontWeight: '700',
          letterSpacing: -0.3,
          color: t.colors.ink,
        }}
      >
        {devotional.coreText}
      </Text>

      {/* Excerpt, precomputed. Capped at 3 lines so a long one cannot push the
          card past its neighbours at large Dynamic Type sizes. */}
      <Text
        numberOfLines={3}
        style={{
          marginTop: t.spacing.sm,
          fontSize: 14.5,
          lineHeight: 14.5 * 1.45,
          color: t.colors.sec,
        }}
      >
        {devotional.excerpt}
      </Text>

      <Text
        style={{
          marginTop: t.spacing.md,
          fontSize: 12,
          fontWeight: '600',
          color: t.colors.muted,
        }}
      >
        {devotional.author}
      </Text>
    </Pressable>
  )
}
