import { useCallback, useMemo } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatPassageLabel, passageId, type Passage } from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import Button from '../components/Button'
import SymbolIcon from '../components/SymbolIcon'
import DevotionalSection from '../components/devotional/DevotionalSection'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import { currentStreak, useReadingStreak } from '../lib/readingStreak'
import { useProfileSprite } from '../lib/useProfileSprite'
import { useTodayReflection } from '../lib/useReflections'

// The Daily Word landing hub (design: [UI] Daily Word Landing). Reached as the
// Daily Word tab root when the "Daily Word opens" preference is "Landing page"
// (the default). Leads with today's M'Cheyne reading and the signed-in user's
// own private reflection, routing onward to the Reader.
//
// Reflections are PRIVATE-ONLY: there is no community feed, no public compose,
// and no path by which one user's reflection reaches another user.
//
// The devotional sits between the chapter list and the reflection, matched to the
// day by scripture (see src/components/devotional/DevotionalSection.tsx). That is
// the order the page reads in: what to read, what someone else wrote on it, then
// what you write yourself. It lives here rather than on Home because it is
// commentary on these readings; on Home the open-day placeholder was just noise.

// English ordinal suffix for a day-of-month (1 → "1st", 22 → "22nd").
function ordinal(n: number): string {
  const v = n % 100
  const suffixes = ['th', 'st', 'nd', 'rd']
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`
}

export default function DailyWordLandingScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation(['reader', 'home', 'common', 'errors'])
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

  const { reflection, loading, error, refresh, remove } = useTodayReflection()

  // Re-read the reflection when the landing regains focus so a just-composed or
  // just-deleted entry (on the pushed compose/journal screens) shows correctly.
  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  // Open the Reader ON the tapped reading. The passage travels as core's
  // `passageId()` rather than a list index, so the Reader resolves it against
  // its own copy of the day's plan (and falls back to the first passage if it
  // can't match) instead of trusting two lists to stay in the same order.
  const openReader = (passage: Passage) =>
    router.push({ pathname: '/daily/reader', params: { passage: passageId(passage) } })

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
            color: t.colors.sec,
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
                onPress={() => openReader(p)}
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
                <SymbolIcon name="chevron.right" size={13} color={t.colors.sec} />
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
                color: t.colors.sec,
              }}
            >
              {tx('empty.subtitle')}
            </Text>
          </Card>
        )}

        {/* No "Read today's passages" CTA below the list: each row now opens the
            Reader on its own chapter, so a button that could only ever open the
            first one duplicated the list without adding a destination. */}

        {/* Today's devotional(s) — after the chapters and before the reflection,
            which is the order the page reads in: what to read, what someone else
            wrote on it, then what you write yourself. Renders nothing at all
            while the month is still downloading; see DevotionalSection. */}
        <DevotionalSection />

        {/* Your reflection */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            color: t.colors.sec,
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
        ) : error ? (
          // Before 1.0.1 there was no error branch here: the hook returned
          // `error` and the screen never read it, so a failed read fell through
          // to the compose CTA below — telling the user they hadn't written
          // today when in fact we could not tell. Tapping it then attempted a
          // second same-day write, which the DB rejects (DuplicateReflectionError).
          // `error` is an i18n key from the hook, never raw error text.
          <Card style={{ alignItems: 'flex-start', gap: t.spacing.sm }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: t.colors.ink }}>
              {tx(error)}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: t.colors.sec }}>
              {tx('errors:load.hint')}
            </Text>
            <Button title={tx('common:retry')} onPress={() => void refresh()} fullWidth={false} />
          </Card>
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
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.textAccent }}>
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
              <Text style={{ fontSize: 12.5, color: t.colors.sec, marginTop: 1 }}>
                {tx('reflection.composeHint')}
              </Text>
            </View>
            <SymbolIcon name="chevron.right" size={13} color={t.colors.sec} />
          </Pressable>
        )}

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
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.colors.textAccent }}>
            {tx('reflection.viewAll')}
          </Text>
          <SymbolIcon name="chevron.right" size={12} color={t.colors.accent} weight="semibold" />
        </Pressable>
      </ScrollView>
    </Screen>
  )
}
