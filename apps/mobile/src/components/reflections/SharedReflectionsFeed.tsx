import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from 'expo-router'
import { useTheme } from '../../theme/ThemeProvider'
import { usePublicFeed } from '../../lib/usePublicReflections'
import { hideReflection } from '../../lib/hiddenPosts'
import { reportReflection } from '../../lib/reflectionsApi'
import { errMessage } from '../../lib/errors'
import PublicReflectionCard from './PublicReflectionCard'
import ReportReflectionSheet from './ReportReflectionSheet'

// The anonymous, today-only community feed section on the Daily Word landing.
// Owns the feed hook, the report sheet, and local hide. Rendered by the landing
// only when the public_reflections flag is on, so an off flag makes it vanish.
export default function SharedReflectionsFeed() {
  const t = useTheme()
  const { t: tx } = useTranslation('reader')
  const { posts, loading, error, refresh, toggleHeart } = usePublicFeed()
  const [reportId, setReportId] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const onHide = (id: string) => hideReflection(id)

  const onSubmitReport = async (reason: string) => {
    const id = reportId
    setReportId(null)
    if (!id) return
    try {
      await reportReflection({ reflectionId: id, reason: reason || undefined })
      hideReflection(id) // auto-hide for the reporter
      Alert.alert(tx('shared.reportDoneTitle'), tx('shared.reportDone'))
    } catch (err: unknown) {
      console.error('[report]', errMessage(err))
      Alert.alert(tx('shared.reportErrorTitle'), tx('shared.reportError'))
    }
  }

  return (
    <View>
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
        {tx('shared.header')}
      </Text>

      {loading ? (
        <View style={{ paddingVertical: t.spacing.lg, alignItems: 'center' }}>
          <ActivityIndicator color={t.colors.accent} />
        </View>
      ) : error ? (
        <Pressable onPress={() => void refresh()} accessibilityRole="button">
          <Text style={{ fontSize: 13.5, color: t.colors.muted }}>{tx('shared.unavailable')}</Text>
        </Pressable>
      ) : posts.length === 0 ? (
        <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.colors.muted }}>{tx('shared.empty')}</Text>
      ) : (
        <View style={{ gap: t.spacing.md }}>
          {posts.map((p) => (
            <PublicReflectionCard
              key={p.id}
              post={p}
              onToggleHeart={toggleHeart}
              onReport={setReportId}
              onHide={onHide}
            />
          ))}
        </View>
      )}

      <ReportReflectionSheet
        visible={reportId !== null}
        onClose={() => setReportId(null)}
        onSubmit={onSubmitReport}
      />
    </View>
  )
}
