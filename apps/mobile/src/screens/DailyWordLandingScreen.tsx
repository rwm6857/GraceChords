import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatPassageLabel } from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import Button from '../components/Button'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import { useTodayReflection } from '../lib/useReflections'
import { usePublicReflectionsEnabled } from '../lib/usePublicReflections'
import SharedReflectionsFeed from '../components/reflections/SharedReflectionsFeed'
import PublicComposeSlot from '../components/reflections/PublicComposeSlot'

// The Daily Word landing hub (design: [UI] Daily Word Landing). Reached as the
// Daily Word tab root when the "Daily Word opens" preference is "Landing page"
// (the default). Leads with today's M'Cheyne reading and the signed-in user's
// own private reflection, routing onward to the Reader.
//
// NOTE: the design's devotional hero card + long-read page are intentionally
// omitted this phase — the public-domain devotional content pipeline does not
// exist yet. The layout is kept forward-compatible so the devotional slots in
// above the reading section when that content lands.

export default function DailyWordLandingScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation('reader')
  const insets = useSafeAreaInsets()

  const today = new Date()
  const dayKey = today.toDateString()
  const passages = useMemo(() => expandReadings(getPlanForDate(new Date()).readings), [dayKey])
  const dateLabel = today.toLocaleDateString(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const { reflection, loading, refresh, remove } = useTodayReflection()
  // Kill-switch: the community feed + public compose only render when the flag is
  // on. When off (or not yet resolved), the private experience below is unchanged.
  const { enabled: publicEnabled, ready: publicReady } = usePublicReflectionsEnabled()
  const showPublic = publicReady && publicEnabled

  // Re-read the reflection when the landing regains focus so a just-composed or
  // just-deleted entry (on the pushed compose/journal screens) shows correctly.
  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const openReader = () => router.push('/daily/reader')

  const onDelete = () => {
    Alert.alert(tx('reflection.deleteTitle'), tx('reflection.deleteMessage'), [
      { text: tx('reflection.cancel'), style: 'cancel' },
      {
        text: tx('reflection.delete'),
        style: 'destructive',
        onPress: () => void remove(),
      },
    ])
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingTop: t.spacing.sm,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
      >
        {/* Header: date + serif title + a reader shortcut */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                letterSpacing: 0.3,
                color: t.colors.muted,
              }}
            >
              {dateLabel}
            </Text>
            <Text
              style={{
                fontFamily: 'Georgia',
                fontSize: 30,
                fontWeight: '700',
                letterSpacing: -0.4,
                color: t.colors.ink,
                marginTop: 3,
              }}
            >
              {tx('landingTitle')}
            </Text>
          </View>
          <Pressable
            onPress={openReader}
            accessibilityRole="button"
            accessibilityLabel={tx('chooseDate')}
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
            <SymbolIcon name="calendar" size={17} color={t.colors.sec} />
          </Pressable>
        </View>

        {/* Today's reading · M'Cheyne */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            color: t.colors.muted,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.md,
          }}
        >
          {tx('landingReadingHeader')}
        </Text>
        {passages.length > 0 ? (
          <Card>
            {passages.map((p, i) => (
              <Pressable
                key={`${p.bookNumber}-${p.chapter}-${i}`}
                onPress={openReader}
                accessibilityRole="button"
                accessibilityLabel={formatPassageLabel(p)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingVertical: 13,
                  paddingHorizontal: t.spacing.lg,
                  borderTopWidth: i === 0 ? 0 : 0.5,
                  borderTopColor: t.colors.border,
                  backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
                })}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: t.colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SymbolIcon name="book.closed" size={15} color={t.colors.textAccent} />
                </View>
                <Text
                  style={{ flex: 1, fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: t.colors.ink }}
                >
                  {formatPassageLabel(p)}
                </Text>
                <SymbolIcon name="chevron.right" size={13} color={t.colors.muted} />
              </Pressable>
            ))}
          </Card>
        ) : (
          <Card>
            <Text
              style={{
                paddingVertical: 16,
                paddingHorizontal: t.spacing.lg,
                fontSize: t.typography.rowSubtitle.fontSize,
                color: t.colors.muted,
              }}
            >
              {tx('empty.subtitle')}
            </Text>
          </Card>
        )}

        {passages.length > 0 ? (
          <Button
            title={tx('landingReadCta')}
            onPress={openReader}
            style={{ marginTop: t.spacing.md }}
          />
        ) : null}

        {/* Shared Reflections — anonymous community feed (flag-gated, above the
            user's own reflection per the design decision). */}
        {showPublic ? <SharedReflectionsFeed /> : null}

        {/* Your reflection */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            color: t.colors.muted,
            marginTop: t.spacing.xl,
            marginBottom: t.spacing.md,
          }}
        >
          {tx('reflection.landingHeader')}
        </Text>

        {loading ? (
          <View style={{ paddingVertical: t.spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : reflection ? (
          <Card style={{ padding: t.spacing.lg }}>
            <Text
              style={{
                fontFamily: 'Georgia',
                fontSize: 16,
                lineHeight: 25,
                color: t.colors.ink,
              }}
            >
              {reflection.body}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: t.spacing.md,
              }}
            >
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={tx('reflection.delete')}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <SymbolIcon name="trash" size={14} color={t.colors.danger} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.danger }}>
                  {tx('reflection.delete')}
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          <Pressable
            onPress={() => router.push('/daily/reflection')}
            accessibilityRole="button"
            accessibilityLabel={tx('reflection.composeCta')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              backgroundColor: t.colors.surface,
              borderColor: t.colors.border,
              borderWidth: 1,
              borderRadius: t.radii.card,
              paddingVertical: 14,
              paddingHorizontal: t.spacing.lg,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                backgroundColor: t.colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SymbolIcon name="square.and.pencil" size={16} color={t.colors.textAccent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>
                {tx('reflection.composeCta')}
              </Text>
              <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 1 }}>
                {tx('reflection.composeHint')}
              </Text>
            </View>
            <SymbolIcon name="chevron.right" size={13} color={t.colors.muted} />
          </Pressable>
        )}

        {/* Share a reflection — public compose slot (flag-gated), below the
            private reflection. Shows a compose CTA or the user's own public post. */}
        {showPublic ? <PublicComposeSlot /> : null}

        <Pressable
          onPress={() => router.push('/daily/journal')}
          accessibilityRole="button"
          accessibilityLabel={tx('reflection.viewAll')}
          hitSlop={8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: t.spacing.md,
            paddingVertical: t.spacing.xs,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.accent }}>
            {tx('reflection.viewAll')}
          </Text>
          <SymbolIcon name="chevron.right" size={12} color={t.colors.accent} weight="semibold" />
        </Pressable>
      </ScrollView>
    </Screen>
  )
}
