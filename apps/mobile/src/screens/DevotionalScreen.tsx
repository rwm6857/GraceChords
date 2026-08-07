import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { selectDevotional, siblingDevotional } from '@gracechords/core/devotional/selection'
import type { DayEntry, Devotional } from '@gracechords/core/devotional/types'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import DevotionalBlocks from '../components/devotional/DevotionalBlocks'
import { useTheme } from '../theme/ThemeProvider'
import { ensureDay, readDay } from '../lib/devotionals/source'

// The full devotional read. Pushed from a home card, and deep-linkable — Android
// App Links are already deployed (assetlinks.json), so an unknown date or slug
// has to render a not-found state rather than crash.
//
// Reached as /devotional/{MM-DD}/{slug}. The date is part of the path because
// slugs are unique WITHIN a day but not globally — 13 recur across the year — so
// a slug alone cannot address an entry.

const CONTENT_MAX_WIDTH = 620

export default function DevotionalScreen({
  dayKey,
  slug,
}: {
  dayKey?: string
  slug?: string
}) {
  const t = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t: tx } = useTranslation('devotional')

  const [day, setDay] = useState<DayEntry | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (!dayKey) { setResolved(true); return }
    let cancelled = false
    // Cache first so a synced day paints without touching the network, then fall
    // back to fetching the month — a deep link can land on a month that has
    // never been read.
    readDay(dayKey)
      .then((cached) => (cached ? cached : ensureDay(dayKey)))
      .then((entry) => { if (!cancelled) { setDay(entry); setResolved(true) } })
      .catch(() => { if (!cancelled) setResolved(true) })
    return () => { cancelled = true }
  }, [dayKey])

  const devotional = slug ? selectDevotional(day, slug) : null
  const sibling = slug ? siblingDevotional(day, slug) : null

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.spacing.sm,
        paddingBottom: t.spacing.xs,
      }}
    >
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        accessibilityRole="button"
        accessibilityLabel={tx('screen.back')}
        hitSlop={10}
        android_ripple={{ color: t.colors.accentSoft, borderless: true, radius: 22 }}
        style={({ pressed }) => [
          { padding: t.spacing.sm },
          Platform.OS === 'ios' && pressed ? { opacity: 0.5 } : null,
        ]}
      >
        <SymbolIcon name="chevron.left" size={20} color={t.colors.accent} />
      </Pressable>
      <View style={{ flex: 1 }} />
    </View>
  )

  // Still resolving: render the chrome only. No spinner — the content is local
  // after first sync, so this frame is normally invisible.
  if (!resolved) {
    return <Screen edges={['top', 'left', 'right']}>{header}</Screen>
  }

  if (!devotional) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        {header}
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: t.spacing.xl,
            gap: t.spacing.md,
          }}
        >
          <SymbolIcon name="book.closed" size={30} color={t.colors.muted} />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '600',
              color: t.colors.ink,
              textAlign: 'center',
            }}
          >
            {tx('notFound.title')}
          </Text>
          <Text
            style={{
              fontSize: 14.5,
              lineHeight: 14.5 * 1.45,
              color: t.colors.sec,
              textAlign: 'center',
            }}
          >
            {tx('notFound.body')}
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      {header}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}>
          <Text
            style={{
              fontSize: 11.5,
              fontWeight: '700',
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: t.colors.textAccent,
            }}
          >
            {devotional.reference}
          </Text>

          {/* `coreText` is the title. The source has no separate one. */}
          <Text
            style={{
              marginTop: t.spacing.sm,
              fontSize: 24,
              lineHeight: 24 * 1.28,
              fontWeight: '700',
              letterSpacing: -0.4,
              color: t.colors.ink,
            }}
          >
            {devotional.coreText}
          </Text>

          <View
            style={{
              height: 1,
              backgroundColor: t.colors.border,
              marginVertical: t.spacing.lg,
            }}
          />

          <DevotionalBlocks blocks={devotional.bodyBlocks} />

          {/* Full attribution: author and the work it comes from. */}
          <Text
            style={{
              marginTop: t.spacing.xl,
              fontSize: 13,
              lineHeight: 13 * 1.45,
              color: t.colors.muted,
            }}
          >
            {tx('screen.attribution', {
              author: devotional.author,
              sourceWork: devotional.sourceWork,
            })}
          </Text>

          {sibling ? <SiblingLink dayKey={dayKey!} devotional={sibling} /> : null}
        </View>
      </ScrollView>
    </Screen>
  )
}

/** The day's other devotional, on the ~220 days that have two. */
function SiblingLink({ dayKey, devotional }: { dayKey: string, devotional: Devotional }) {
  const t = useTheme()
  const router = useRouter()
  const { t: tx } = useTranslation('devotional')

  return (
    <Pressable
      onPress={() => router.replace(`/devotional/${dayKey}/${devotional.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={tx('card.open', { reference: devotional.reference })}
      android_ripple={{ color: t.colors.accentSoft, borderless: false }}
      style={({ pressed }) => [
        {
          marginTop: t.spacing.xl,
          paddingVertical: t.spacing.md,
          paddingHorizontal: t.spacing.lg,
          borderRadius: t.radii.card,
          borderWidth: 1,
          borderColor: t.colors.border,
          backgroundColor: t.colors.surface,
        },
        Platform.OS === 'ios' && pressed ? { opacity: 0.6 } : null,
      ]}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          color: t.colors.muted,
        }}
      >
        {tx('screen.alsoToday')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.colors.textAccent }}>
            {devotional.reference}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              marginTop: 3,
              fontSize: 15,
              lineHeight: 15 * 1.35,
              fontWeight: '600',
              color: t.colors.ink,
            }}
          >
            {devotional.coreText}
          </Text>
        </View>
        <SymbolIcon name="chevron.right" size={14} color={t.colors.muted} />
      </View>
    </Pressable>
  )
}
