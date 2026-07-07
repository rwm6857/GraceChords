import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ConstrainedContent from '../components/ConstrainedContent'
import SymbolIcon from '../components/SymbolIcon'
import DailyWordCard from '../components/home/DailyWordCard'
import RecentSongsCard from '../components/home/RecentSongsCard'
import { cardStyle } from '../components/home/cardStyle'
import { useTheme } from '../theme/ThemeProvider'
import {
  getDisplayName,
  pickSubGreeting,
  timeGreeting,
  useCurrentUser,
} from '../lib/greetings'
import { useIsTabletWidth } from '../lib/useIsTabletWidth'
import { useProfileSprite } from '../lib/useProfileSprite'
import { getRecentlyOpened } from '../lib/recents'
import { useLastSet } from '../lib/useLastSet'
import { useStarredSongs, type StarredSong } from '../lib/useStarredSongs'
import type { Song } from '../lib/useSongList'

function songMeta(song: Song): string {
  return [
    song.default_key ? `Key of ${song.default_key}` : null,
    song.time_signature,
    song.tempo ? `${song.tempo} BPM` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function HomeScreen() {
  const t = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isTablet = useIsTabletWidth()
  const user = useCurrentUser()
  const { source: spriteSource } = useProfileSprite()
  const { songs: starred, loading: starredLoading, error: starredError } = useStarredSongs()

  const greeting = `${timeGreeting()}, ${getDisplayName(user)}`
  const subGreeting = pickSubGreeting()

  // Recently-opened comes from on-device history (recorded by the Viewer);
  // the Last set card reads the real most-recently-edited setlist. Re-render
  // on focus so the Continue card and Recent-songs card reflect opens made
  // since Home last rendered.
  const [, setFocusTick] = useState(0)
  useFocusEffect(
    useCallback(() => {
      setFocusTick((n) => n + 1)
    }, []),
  )
  const continueSong = getRecentlyOpened()[0] ?? null
  const { lastSet } = useLastSet()

  function onAvatar() {
    router.push('/settings')
  }

  function openSong(s: { slug: string; title: string; artist: string | null; default_key: string | null }) {
    router.push({
      pathname: '/viewer/[slug]',
      params: {
        slug: s.slug,
        title: s.title,
        artist: s.artist ?? '',
        songKey: s.default_key ?? '',
      },
    })
  }

  // ===== Dashboard cards, arranged by the grid/stack below =====

  const lastSetCard = lastSet ? (
    <View style={cardStyle(t)}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          color: t.colors.textAccent,
        }}
      >
        Last set
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
            {lastSet.name}
          </Text>
          <Text style={{ fontSize: 13, color: t.colors.sec, marginTop: 4 }}>
            {lastSet.songCount} {lastSet.songCount === 1 ? 'song' : 'songs'} · ~{lastSet.durationMin} min
          </Text>
        </View>
        {lastSet.keys ? (
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: t.colors.textAccent,
              backgroundColor: t.colors.accentSoft,
              borderRadius: 8,
              paddingHorizontal: 9,
              paddingVertical: 5,
              overflow: 'hidden',
            }}
          >
            Keys {lastSet.keys}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Pressable
          onPress={() => router.push(`/setlist/${lastSet.id}`)}
          accessibilityRole="button"
          style={{
            flex: 1,
            height: 46,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: t.colors.onAccent }}>
            Resume
          </Text>
          <SymbolIcon name="chevron.right" size={14} color={t.colors.onAccent} weight="semibold" />
        </Pressable>
        <Pressable
          onPress={() => router.push(`/setlist/${lastSet.id}`)}
          accessibilityRole="button"
          accessibilityLabel="Edit set"
          style={{
            width: 46,
            height: 46,
            borderRadius: t.radii.md,
            backgroundColor: t.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SymbolIcon name="square.and.pencil" size={20} color={t.colors.textAccent} />
        </Pressable>
      </View>
    </View>
  ) : null

  const starredCard = (
    <View style={cardStyle(t)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <SymbolIcon name="star.fill" size={12} color={t.colors.star} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: t.colors.textAccent,
          }}
        >
          Starred songs
        </Text>
      </View>

      {starredLoading ? (
        <ActivityIndicator color={t.colors.accent} style={{ marginTop: t.spacing.md }} />
      ) : starredError ? (
        <Text style={{ marginTop: t.spacing.md, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.muted }}>
          {starredError}
        </Text>
      ) : starred.length === 0 ? (
        <Text style={{ marginTop: t.spacing.md, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.muted }}>
          Songs you star will appear here.
        </Text>
      ) : (
        <View style={{ marginTop: t.spacing.xs }}>
          {starred.map((s: StarredSong, i: number) => (
            <Pressable
              key={s.id}
              onPress={() => openSong(s)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${s.title}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderTopColor: t.colors.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: t.typography.rowTitle.fontSize,
                    fontWeight: t.typography.rowTitle.fontWeight,
                    letterSpacing: t.typography.rowTitle.letterSpacing,
                    color: t.colors.ink,
                  }}
                >
                  {s.title}
                </Text>
                {s.artist ? (
                  <Text
                    numberOfLines={1}
                    style={{ marginTop: 1, fontSize: t.typography.rowSubtitle.fontSize, color: t.colors.sec }}
                  >
                    {s.artist}
                  </Text>
                ) : null}
              </View>
              {s.default_key || s.time_signature ? (
                <View style={{ alignItems: 'flex-end' }}>
                  {s.default_key ? (
                    <Text
                      style={{
                        fontSize: t.typography.rowKey.fontSize,
                        fontWeight: t.typography.rowKey.fontWeight,
                        color: t.colors.textAccent,
                      }}
                    >
                      {s.default_key}
                    </Text>
                  ) : null}
                  {s.time_signature ? (
                    <Text style={{ marginTop: 2, fontSize: t.typography.rowMeta.fontSize, color: t.colors.muted }}>
                      {s.time_signature}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: t.spacing.xl }}
      >
        {/* ===== Hero ===== */}
        <View>
          <LinearGradient
            colors={t.colors.heroGradient.colors}
            locations={t.colors.heroGradient.locations}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              paddingTop: insets.top + t.spacing.sm,
              paddingHorizontal: t.spacing.lg,
              paddingBottom: continueSong ? 84 : t.spacing.xl,
            }}
          >
            {/* Soft top glow (approximates the design's radial highlight). */}
            <LinearGradient
              pointerEvents="none"
              colors={[t.colors.heroGlow, 'transparent']}
              style={StyleSheet.absoluteFill}
            />

            <ConstrainedContent tier="dashboard">
            {/* Brand row + avatar */}
            <View
              style={{
                height: 40,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Image
                  source={require('../../assets/icon.png')}
                  accessibilityLabel="GraceChords"
                  style={{ width: 28, height: 28, borderRadius: 8 }}
                />
                <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
                  GraceChords
                </Text>
              </View>
              <Pressable
                onPress={onAvatar}
                accessibilityRole="button"
                accessibilityLabel="Profile and settings"
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

            {/* Greeting */}
            <View style={{ paddingTop: 22, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.4, lineHeight: 36, color: t.colors.ink }}>
                {greeting}
              </Text>
              {subGreeting ? (
                <Text style={{ fontSize: 15, lineHeight: 22, color: t.colors.sec, marginTop: 6 }}>
                  {subGreeting}
                </Text>
              ) : null}
            </View>
            </ConstrainedContent>
          </LinearGradient>

          {/* Continue where you left off — overlaps up into the hero. Shown only
              when there is recent history. */}
          {continueSong ? (
            <View style={{ paddingHorizontal: t.spacing.lg, marginTop: -66 }}>
              <ConstrainedContent tier="dashboard">
              <View style={cardStyle(t, true)}>
                <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.2, color: t.colors.ink, marginBottom: 13 }}>
                  Continue where you left off
                </Text>
                <Pressable
                  onPress={() => openSong(continueSong)}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      backgroundColor: t.colors.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 23, fontWeight: '700', color: t.colors.textAccent }}>
                      {continueSong.default_key?.charAt(0) ?? '♪'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
                      {continueSong.title}
                    </Text>
                    {continueSong.artist ? (
                      <Text numberOfLines={1} style={{ fontSize: 14, color: t.colors.sec, marginTop: 1 }}>
                        {continueSong.artist}
                      </Text>
                    ) : null}
                    {songMeta(continueSong) ? (
                      <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.colors.muted, marginTop: 3 }}>
                        {songMeta(continueSong)}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: t.radii.pill,
                      backgroundColor: t.colors.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <SymbolIcon name="chevron.right" size={16} color={t.colors.onAccent} weight="semibold" />
                  </View>
                </Pressable>
              </View>
              </ConstrainedContent>
            </View>
          ) : null}
        </View>

        {/* ===== Dashboard: 2-column grid on tablets, one stack on phones.
            Same cards on both form factors — only the arrangement differs. ===== */}
        {isTablet ? (
          // Padding sits OUTSIDE the width cap, matching the Continue card's
          // nesting, so the grid's total width equals the hero cards above.
          <View style={{ paddingHorizontal: t.spacing.lg }}>
            <ConstrainedContent tier="dashboard">
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: t.spacing.lg,
                  marginTop: 26,
                }}
              >
                <View style={{ flex: 1, gap: t.spacing.lg }}>
                  {lastSetCard}
                  {starredCard}
                </View>
                <View style={{ flex: 1, gap: t.spacing.lg }}>
                  <DailyWordCard />
                  <RecentSongsCard />
                </View>
              </View>
            </ConstrainedContent>
          </View>
        ) : (
          <>
            {lastSetCard ? (
              <View style={{ paddingHorizontal: t.spacing.lg, marginTop: 26 }}>{lastSetCard}</View>
            ) : null}
            <View style={{ paddingHorizontal: t.spacing.lg, marginTop: 26 }}>
              <DailyWordCard />
            </View>
            <View style={{ paddingHorizontal: t.spacing.lg, marginTop: t.spacing.lg }}>
              <RecentSongsCard />
            </View>
            <View style={{ paddingHorizontal: t.spacing.lg, marginTop: t.spacing.lg }}>
              {starredCard}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}
