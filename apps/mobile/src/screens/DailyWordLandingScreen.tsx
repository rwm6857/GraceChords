import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native'
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
import { currentStreak, useReadingStreak } from '../lib/readingStreak'
import { useProfileSprite } from '../lib/useProfileSprite'
import { useTodayReflection } from '../lib/useReflections'
import { usePublicReflectionsEnabled } from '../lib/usePublicReflections'
import { useAgeGate, type AgeRange } from '../lib/ageGate'
import { requestDeclaredAgeRange } from '../lib/declaredAgeRange'
import SharedReflectionsFeed from '../components/reflections/SharedReflectionsFeed'
import PublicComposeSlot from '../components/reflections/PublicComposeSlot'
import UgcTermsSheet from '../components/reflections/UgcTermsSheet'

// The Daily Word landing hub (design: [UI] Daily Word Landing). Reached as the
// Daily Word tab root when the "Daily Word opens" preference is "Landing page"
// (the default). Leads with today's M'Cheyne reading and the signed-in user's
// own private reflection, routing onward to the Reader.
//
// NOTE: the design's devotional hero card + long-read page are intentionally
// omitted this phase — the public-domain devotional content pipeline does not
// exist yet. The layout is kept forward-compatible so the devotional slots in
// above the reading section when that content lands.

// English ordinal suffix for a day-of-month (1 → "1st", 22 → "22nd").
function ordinal(n: number): string {
  const v = n % 100
  const suffixes = ['th', 'st', 'nd', 'rd']
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`
}

export default function DailyWordLandingScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation(['reader', 'home'])
  const insets = useSafeAreaInsets()
  const { source: spriteSource } = useProfileSprite()

  const today = new Date()
  const dayKey = today.toDateString()
  const passages = useMemo(() => expandReadings(getPlanForDate(new Date()).readings), [dayKey])
  // The date now lives on the reading section header ("July 19th's reading")
  // instead of the page header, keeping the header consistent with the rest of
  // the app (serif title + profile avatar). English gets an ordinal day; other
  // locales use their natural month/day order.
  const readingDate = i18n.language.startsWith('en')
    ? `${today.toLocaleDateString('en', { month: 'long' })} ${ordinal(today.getDate())}`
    : today.toLocaleDateString(i18n.language, { month: 'long', day: 'numeric' })

  // Reading streak — OPT-IN (enabled in Daily Word → Reader settings). Mirrors
  // Home's DailyWordCard: shown only when enabled. Opening the Reader from the
  // landing marks the day read (DailyWordScreen.markReadToday), and this hook
  // re-renders the landing live on return.
  const streak = useReadingStreak()
  const streakCount = currentStreak(streak, today)

  const { reflection, loading, refresh, remove } = useTodayReflection()
  // Kill-switch: the community feed + public compose only render when the flag is
  // on. When off (or not yet resolved), the private experience below is unchanged.
  const { enabled: publicEnabled, ready: publicReady } = usePublicReflectionsEnabled()
  // Age assurance: the public section (view + share) is kept from under-13 users.
  // It shows only once the user is known to be 13+. When their age isn't known
  // yet, an unlock card takes the feed's place; the private experience is never
  // gated.
  const age = useAgeGate()
  const showPublic = publicReady && publicEnabled && age.ready && age.isThirteenPlus
  const showAgeUnlock = publicReady && publicEnabled && age.ready && age.range == null
  const [ugcVisible, setUgcVisible] = useState(false)
  const [seededAge, setSeededAge] = useState<AgeRange | undefined>(undefined)

  // User-initiated unlock: try Apple's Declared Age Range API first (real age
  // assurance, no birthdate). A confident "under 13" hides the section with no
  // popup; otherwise open the age + terms gate (seeded with 13+ when the API
  // confirmed it, else asking the user to self-declare).
  const beginAgeUnlock = useCallback(async () => {
    const result = await requestDeclaredAgeRange()
    if (result === 'under_13') {
      await age.record('under_13', 'declared_api')
      return
    }
    setSeededAge(result === 'over_13' ? '13_plus' : undefined)
    setUgcVisible(true)
  }, [age])

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
        {/* Header: large-title (+ optional streak) + the profile/settings avatar,
            matching the Home header and every other screen's page title. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: t.typography.largeTitle.fontSize,
                fontWeight: t.typography.largeTitle.fontWeight,
                letterSpacing: t.typography.largeTitle.letterSpacing,
                color: t.colors.ink,
              }}
            >
              {tx('landingTitle')}
            </Text>
            {streak.enabled ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <SymbolIcon
                  name="flame.fill"
                  size={13}
                  color={streakCount > 0 ? t.colors.star : t.colors.muted}
                />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.colors.sec }}>
                  {tx('streakDays', { count: streakCount })}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={tx('home:profileAndSettings')}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.accentSoft,
                borderWidth: 1,
                borderColor: t.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {spriteSource ? (
                <Image source={spriteSource} style={{ width: 30, height: 30 }} resizeMode="contain" />
              ) : (
                <SymbolIcon name="person" size={20} color={t.colors.accent} />
              )}
            </View>
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
          {tx('landingReadingHeader', { date: readingDate })}
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
            user's own reflection per the design decision). Under-13 users see
            neither the feed nor the compose slot; a user whose age isn't known
            yet gets a one-time unlock card in the feed's place. */}
        {showPublic ? (
          <SharedReflectionsFeed />
        ) : showAgeUnlock ? (
          <Card style={{ marginTop: t.spacing.xl }}>
            <View style={{ padding: t.spacing.lg, gap: t.spacing.sm }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.colors.ink }}>
                {tx('publicLocked.title')}
              </Text>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.colors.sec }}>
                {tx('publicLocked.body')}
              </Text>
              <Button
                title={tx('publicLocked.cta')}
                onPress={() => void beginAgeUnlock()}
                style={{ marginTop: t.spacing.xs }}
              />
            </View>
          </Card>
        ) : null}

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
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Text
              style={{
                fontFamily: 'Georgia',
                fontSize: 16,
                lineHeight: 25,
                color: t.colors.ink,
                padding: t.spacing.lg,
              }}
            >
              {reflection.body}
            </Text>
            {/* Footer sits below a hairline so the actions read as intentional
                whether the body is one line or many. Private reflections are
                editable; delete stays available. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTopWidth: 0.5,
                borderTopColor: t.colors.border,
                paddingHorizontal: t.spacing.lg,
                paddingVertical: t.spacing.sm,
              }}
            >
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/daily/reflection',
                    params: {
                      editId: reflection.id,
                      initialBody: reflection.body,
                      date: reflection.reflection_date,
                    },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={tx('reflection.edit')}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <SymbolIcon name="square.and.pencil" size={14} color={t.colors.accent} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.accent }}>
                  {tx('reflection.edit')}
                </Text>
              </Pressable>
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

      {/* Age + terms unlock gate for the public section. Refreshing the age gate
          on close lets showPublic / showAgeUnlock recompute immediately. */}
      <UgcTermsSheet
        visible={ugcVisible}
        seededAgeRange={seededAge}
        onClose={() => setUgcVisible(false)}
        onAgreed={() => {
          setUgcVisible(false)
          void age.refresh()
        }}
        onDeclined={() => {
          setUgcVisible(false)
          void age.refresh()
        }}
      />
    </Screen>
  )
}
