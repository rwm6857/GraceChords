import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SONG_STATS_DEFAULT_WINDOW, SONG_STATS_INSIGHT_RULES } from '@gracechords/core'
import Card from '../Card'
import SymbolIcon from '../SymbolIcon'
import SongStatsSummaryRows from './SongStatsSummaryRows'
import SongStatsAboutSheet from './SongStatsAboutSheet'
import { useSongStatsInsights } from '../../lib/useSongStatsInsights'
import { useTheme } from '../../theme/ThemeProvider'

/**
 * The Song Stats summary at the top of the Setlists tab — where planning
 * already happens. Renders nothing until the user has logged enough sets
 * (an empty card would read as a broken feature). Taps through to the detail.
 */
export default function SongStatsCard() {
  const t = useTheme()
  const { t: tx } = useTranslation('stats')
  const router = useRouter()
  const [aboutOpen, setAboutOpen] = useState(false)
  const { insights, visible, preview } = useSongStatsInsights(SONG_STATS_DEFAULT_WINDOW)
  if (!insights || !visible) return null
  const open = () => router.push('/song-stats')

  const previewNote = preview.sample
    ? tx('preview.sampleBadge')
    : !insights.gateMet
      ? tx('preview.belowGate', { done: insights.totalSessions, count: SONG_STATS_INSIGHT_RULES.gateSessions })
      : null

  return (
    <View style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md }}>
      <Card>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${tx('title')}, ${previewNote ?? tx('cardWindow')}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: t.spacing.md,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.xs,
            gap: t.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: t.colors.ink }}>{tx('title')}</Text>
            <Text style={{ fontSize: 13, color: t.colors.sec, marginTop: 2 }}>
              {previewNote ?? tx('cardWindow')}
            </Text>
          </View>
          <SymbolIcon name="chevron.right" size={14} color={t.colors.sec} />
        </Pressable>
        <SongStatsSummaryRows summary={insights.summary} onPress={open} />
      </Card>
      <Pressable
        onPress={() => setAboutOpen(true)}
        accessibilityRole="link"
        hitSlop={8}
        style={{ alignSelf: 'flex-start', paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm }}
      >
        <Text style={{ fontSize: 13, color: t.colors.textAccent }}>{tx('about.link')}</Text>
      </Pressable>
      <SongStatsAboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </View>
  )
}
