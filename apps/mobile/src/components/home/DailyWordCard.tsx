import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { formatPassageLabel } from '@gracechords/core'
import SymbolIcon from '../SymbolIcon'
import { cardStyle } from './cardStyle'
import { useTheme } from '../../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../../lib/bibleSource'
import { currentStreak, useReadingStreak } from '../../lib/readingStreak'

// Home's Daily Word card: today's date and the day's M'Cheyne passage chips,
// plus the reading streak — shown ONLY when the user has opted in (the enable
// toggle lives in the Daily Word reader settings; no nagging here). The whole
// card opens the Daily Word tab, which defaults to today.

export default function DailyWordCard() {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation('home')
  const router = useRouter()
  const streak = useReadingStreak()

  const today = new Date()
  // Keyed by calendar day so the plan re-derives at midnight, not per render.
  const dayKey = today.toDateString()
  const passages = useMemo(() => expandReadings(getPlanForDate(new Date()).readings), [dayKey])
  const dateLabel = today.toLocaleDateString(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const streakCount = currentStreak(streak, today)

  return (
    <Pressable
      onPress={() => router.navigate('/daily')}
      accessibilityRole="button"
      accessibilityLabel={tx('dailyWordCard.open')}
      style={cardStyle(t)}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          color: t.colors.textAccent,
        }}
      >
        {tx('dailyWordCard.label')}
      </Text>
      <Text style={{ marginTop: 6, fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
        {dateLabel}
      </Text>

      {passages.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: t.spacing.md }}>
          {passages.map((p) => (
            <View
              key={formatPassageLabel(p)}
              style={{
                backgroundColor: t.colors.accentSoft,
                borderRadius: 8,
                paddingHorizontal: 9,
                paddingVertical: 5,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: t.colors.textAccent }}>
                {formatPassageLabel(p)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ marginTop: t.spacing.md, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.muted }}>
          {tx('dailyWordCard.empty')}
        </Text>
      )}

      {streak.enabled ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: t.spacing.md }}>
          <SymbolIcon name="flame.fill" size={14} color={streakCount > 0 ? t.colors.star : t.colors.muted} />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.colors.sec }}>
            {tx('dailyWordCard.streak', { count: streakCount })}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
