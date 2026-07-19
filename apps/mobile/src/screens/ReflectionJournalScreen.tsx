import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatPassageLabel } from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { expandReadings, getPlanForDate } from '../lib/bibleSource'
import { useReflectionList } from '../lib/useReflections'

// The reflection journal (design intent: reverse-chronological list of the
// user's own reflections, grouped by date). Reachable from the Daily Word
// landing. Tap a row to read the entry; edit or delete own private reflections
// with confirm. Public posts are immutable (delete only) — no edit affordance.

/** Parse a YYYY-MM-DD key into a LOCAL Date (avoids UTC day-shift). */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => Number(n))
  return new Date(y, (m || 1) - 1, d || 1)
}

export default function ReflectionJournalScreen() {
  const t = useTheme()
  const router = useRouter()
  const { t: tx, i18n } = useTranslation('reader')
  const insets = useSafeAreaInsets()
  const { reflections, loading, error, refresh, remove } = useReflectionList()
  const [expanded, setExpanded] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const onDelete = (id: string) => {
    Alert.alert(tx('reflection.deleteTitle'), tx('reflection.deleteMessage'), [
      { text: tx('reflection.cancel'), style: 'cancel' },
      {
        text: tx('reflection.delete'),
        style: 'destructive',
        onPress: () => void remove(id),
      },
    ])
  }

  const passagesForDate = (key: string) => {
    try {
      return expandReadings(getPlanForDate(dateFromKey(key)).readings)
        .map(formatPassageLabel)
        .join(' · ')
    } catch {
      return ''
    }
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Header: back to landing + title */}
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
          accessibilityLabel={tx('backToLanding')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.accent }}>
            {tx('landingTitle')}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.colors.ink }}>
          {tx('reflection.journalTitle')}
        </Text>
        <View style={{ flex: 1 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : error ? (
        <EmptyState
          icon="wifi.slash"
          title={tx('error.title')}
          subtitle={tx('error.subtitle')}
          actionLabel={tx('error.retry')}
          onAction={() => void refresh()}
        />
      ) : reflections.length === 0 ? (
        <EmptyState
          icon="square.and.pencil"
          title={tx('reflection.emptyTitle')}
          subtitle={tx('reflection.emptySubtitle')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.xs,
            paddingBottom: insets.bottom + t.spacing.xxl,
            gap: t.spacing.md,
          }}
        >
          {reflections.map((r) => {
            const isOpen = expanded === r.id
            const dateLabel = dateFromKey(r.reflection_date).toLocaleDateString(i18n.language, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
            const passages = passagesForDate(r.reflection_date)
            return (
              <Card key={r.id}>
                <Pressable
                  onPress={() => setExpanded(isOpen ? null : r.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    paddingVertical: 13,
                    paddingHorizontal: t.spacing.lg,
                    backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 15.5, fontWeight: '600', color: t.colors.ink }}>
                        {dateLabel}
                      </Text>
                      {r.visibility === 'public' ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: t.colors.accentSoft,
                            borderRadius: 6,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                          }}
                        >
                          <SymbolIcon name="person.2.fill" size={10} color={t.colors.textAccent} />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.colors.textAccent }}>
                            {tx('journal.sharedLabel')}
                          </Text>
                          <SymbolIcon name="heart.fill" size={9} color={t.colors.danger} />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.colors.textAccent }}>
                            {r.heart_count ?? 0}
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            backgroundColor: t.colors.surfaceAlt,
                            borderRadius: 6,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                          }}
                        >
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.colors.muted }}>
                            {tx('journal.privateLabel')}
                          </Text>
                        </View>
                      )}
                    </View>
                    {passages ? (
                      <Text style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 2 }} numberOfLines={1}>
                        {passages}
                      </Text>
                    ) : null}
                    {!isOpen ? (
                      <Text style={{ fontSize: 13.5, color: t.colors.sec, marginTop: 4 }} numberOfLines={1}>
                        {r.body}
                      </Text>
                    ) : null}
                  </View>
                  <SymbolIcon
                    name={isOpen ? 'chevron.up' : 'chevron.down'}
                    size={13}
                    color={t.colors.muted}
                  />
                </Pressable>

                {isOpen ? (
                  <View
                    style={{
                      paddingHorizontal: t.spacing.lg,
                      paddingBottom: t.spacing.lg,
                      borderTopWidth: 0.5,
                      borderTopColor: t.colors.border,
                      paddingTop: t.spacing.md,
                    }}
                  >
                    <Text style={{ fontFamily: 'Georgia', fontSize: 16, lineHeight: 25, color: t.colors.ink }}>
                      {r.body}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: r.visibility === 'private' ? 'space-between' : 'flex-end',
                        marginTop: t.spacing.md,
                      }}
                    >
                      {/* Only private reflections are editable — public posts are immutable. */}
                      {r.visibility === 'private' ? (
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: '/daily/reflection',
                              params: { editId: r.id, initialBody: r.body, date: r.reflection_date },
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
                      ) : null}
                      <Pressable
                        onPress={() => onDelete(r.id)}
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
                  </View>
                ) : null}
              </Card>
            )
          })}
        </ScrollView>
      )}
    </Screen>
  )
}
