import { useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  SONG_STATS_DEFAULT_WINDOW,
  SONG_STATS_INSIGHT_RULES as R,
  SONG_STATS_RULES,
  SONG_STATS_WINDOWS,
  formatSongStatsDate,
  type SongStatsWindow,
  type StatsSong,
} from '@gracechords/core'
import Screen from '../components/Screen'
import Card from '../components/Card'
import ListRow from '../components/ListRow'
import SectionHeader from '../components/SectionHeader'
import SymbolIcon from '../components/SymbolIcon'
import GlassSurface from '../components/GlassSurface'
import EmptyState from '../components/EmptyState'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SegmentedPill from '../components/SegmentedPill'
import ConstrainedContent from '../components/ConstrainedContent'
import { PersonalChip } from '../components/PersonalChip'
import SongStatsSummaryRows from '../components/songStats/SongStatsSummaryRows'
import SongStatsAboutSheet from '../components/songStats/SongStatsAboutSheet'
import { useSongStatsInsights } from '../lib/useSongStatsInsights'
import { isSongStatsEnabled } from '../lib/songStats'
import { useTheme } from '../theme/ThemeProvider'

// Song Stats detail. Worship-planning prompts, not a scoreboard: every
// section reads as an observation ("You haven't sung these in…"), with no
// streaks, badges or comparison to anyone else. Sections with nothing to say
// are left out rather than shown empty.
export default function SongStatsScreen() {
  const t = useTheme()
  const { t: tx, i18n } = useTranslation(['stats', 'common'])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [barH, setBarH] = useState(0)
  const [range, setRange] = useState<SongStatsWindow>(SONG_STATS_DEFAULT_WINDOW)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { status, insights, visible, preview, reload } = useSongStatsInsights(range)
  const collecting = isSongStatsEnabled()

  const date = (d: string) => formatSongStatsDate(d, i18n.language)
  const name = (s: StatsSong) => s.title ?? tx('removedSong')
  const hint = { fontSize: 12.5, lineHeight: 17, color: t.colors.sec }

  async function onRefresh() {
    setRefreshing(true)
    await reload()
    setRefreshing(false)
  }

  function songRows<T extends StatsSong>(items: T[], value: (item: T) => string) {
    return (
      <Card>
        {items.map((item, i) => (
          <ListRow
            key={item.key}
            title={name(item)}
            badge={item.source === 'personal' ? <PersonalChip /> : undefined}
            value={value(item)}
            accessibilityLabel={`${name(item)}, ${value(item)}`}
            isLast={i === items.length - 1}
          />
        ))}
      </Card>
    )
  }

  function section(title: string, body: ReactNode, note?: string) {
    return (
      <>
        <SectionHeader label={title} />
        {body}
        {note ? <Text style={[hint, { paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm }]}>{note}</Text> : null}
      </>
    )
  }

  function emptyLine(text: string) {
    return (
      <Card>
        <Text style={{ padding: t.spacing.md, fontSize: 15, color: t.colors.sec }}>{text}</Text>
      </Card>
    )
  }

  function renderStats() {
    if (!insights) return null
    const s = insights
    return (
      <>
        {section(
          tx('overview'),
          <Card>
            <SongStatsSummaryRows summary={s.summary} />
          </Card>,
        )}

        {section(
          tx('mostSung.title'),
          s.mostSung.length
            ? songRows(s.mostSung, (x) => tx('mostSung.count', { count: x.count }))
            : emptyLine(tx('mostSung.empty')),
        )}

        {s.newThisPeriod.length
          ? section(
              tx('newSongs.title'),
              songRows(s.newThisPeriod, (x) => date(x.firstSung)),
            )
          : null}

        {s.heavyRotation.length
          ? section(
              tx('rotation.title'),
              songRows(s.heavyRotation, (x) => tx('rotation.value', { sets: x.sets, of: x.of })),
              tx('rotation.hint', { min: R.heavyRotationMin, of: R.recentSessions }),
            )
          : null}

        {s.resting.length
          ? section(
              tx('resting.title'),
              songRows(s.resting, (x) => date(x.lastSung)),
              tx('resting.hint', { months: Math.round(R.dormantDays / 30) }),
            )
          : null}
      </>
    )
  }

  function renderBody() {
    if (status === 'loading') return <LoadingSkeleton />
    if (status === 'error') {
      return (
        <EmptyState
          icon="wifi.slash"
          title={tx('loadError')}
          subtitle={tx('errors:load.hint')}
          actionLabel={tx('common:retry')}
          onAction={() => void reload()}
        />
      )
    }
    if (!visible) {
      return (
        <EmptyState
          icon="music.note.list"
          title={tx('gate.title', { count: R.gateSessions })}
          subtitle={tx('gate.body', { done: insights?.totalSessions ?? 0, perSong: SONG_STATS_RULES.perSongSessionMs / 1000 })}
        />
      )
    }
    return renderStats()
  }

  const previewNote = preview.sample
    ? tx('preview.sampleBadge')
    : insights && visible && !insights.gateMet
      ? tx('preview.belowGate', { done: insights.totalSessions, count: R.gateSessions })
      : null

  return (
    <Screen edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.colors.muted}
            progressViewOffset={barH}
          />
        }
        contentContainerStyle={{
          flexGrow: 1,
          // On phones ConstrainedContent is a pass-through, so the gutter lives here.
          paddingHorizontal: t.spacing.lg,
          paddingTop: barH + t.spacing.sm,
          paddingBottom: insets.bottom + t.spacing.xxl,
        }}
      >
        <ConstrainedContent tier="content">
          <Text
            style={{
              fontSize: t.typography.largeTitle.fontSize,
              fontWeight: t.typography.largeTitle.fontWeight,
              letterSpacing: t.typography.largeTitle.letterSpacing,
              color: t.colors.ink,
              paddingHorizontal: t.spacing.xs,
              paddingBottom: t.spacing.md,
            }}
          >
            {tx('title')}
          </Text>

          {previewNote ? (
            <Text style={[hint, { paddingHorizontal: t.spacing.xs, paddingBottom: t.spacing.sm }]}>
              {previewNote}
            </Text>
          ) : null}
          {!collecting ? (
            <Text style={[hint, { paddingHorizontal: t.spacing.xs, paddingBottom: t.spacing.sm }]}>
              {tx('off')}
            </Text>
          ) : null}

          {visible ? (
            <SegmentedPill<SongStatsWindow>
              options={SONG_STATS_WINDOWS.map((w) => ({ value: w, label: tx(`window.${w}`) }))}
              value={range}
              onChange={setRange}
            />
          ) : null}

          {renderBody()}

          {preview.canPreview ? (
            <>
              <SectionHeader label={tx('preview.title')} />
              <Card>
                <ListRow
                  title={tx('preview.bypassGate', { count: R.gateSessions })}
                  trailing={
                    <Switch
                      value={preview.bypassGate}
                      onValueChange={(v) => preview.set({ bypassGate: v })}
                      trackColor={{ true: t.colors.accent }}
                      accessibilityLabel={tx('preview.bypassGate', { count: R.gateSessions })}
                    />
                  }
                />
                <ListRow
                  title={tx('preview.sample')}
                  isLast
                  trailing={
                    <Switch
                      value={preview.sample}
                      onValueChange={(v) => preview.set({ sample: v })}
                      trackColor={{ true: t.colors.accent }}
                      accessibilityLabel={tx('preview.sample')}
                    />
                  }
                />
              </Card>
              <Text style={[hint, { paddingHorizontal: t.spacing.md, paddingTop: t.spacing.sm }]}>
                {tx('preview.hint')}
              </Text>
            </>
          ) : null}

          <Pressable
            onPress={() => setAboutOpen(true)}
            accessibilityRole="link"
            hitSlop={8}
            style={{ alignSelf: 'center', paddingTop: t.spacing.xl }}
          >
            <Text style={{ fontSize: 14, color: t.colors.textAccent }}>{tx('about.link')}</Text>
          </Pressable>
        </ConstrainedContent>
      </ScrollView>

      {/* Scroll-behind top bar, matching Account. */}
      <GlassSurface
        fallbackColor={t.colors.bg}
        fallbackHairline
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
          paddingHorizontal: t.spacing.md,
          paddingBottom: t.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tx('common:back')}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '500', color: t.colors.textAccent }}>
            {tx('common:back')}
          </Text>
        </Pressable>
      </GlassSurface>

      <SongStatsAboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </Screen>
  )
}
