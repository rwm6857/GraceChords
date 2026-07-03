import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ListRow from '../components/ListRow'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import type { Tokens } from '@gracechords/tokens/native'
import {
  getDisplayName,
  pickSubGreeting,
  timeGreeting,
  useCurrentUser,
} from '../lib/greetings'
import { useProfileSprite } from '../lib/useProfileSprite'
import { getRecentlyOpened } from '../lib/recents'
import { useLastSet } from '../lib/useLastSet'
import { useStarredSongs, type StarredSong } from '../lib/useStarredSongs'
import type { Song } from '../lib/useSongList'

// A themed card surface. Unlike the Card primitive (which clips with
// overflow:hidden), this keeps shadows visible — needed for the hero's
// overlapping "Continue" card.
function cardStyle(t: Tokens, elevated = false): ViewStyle {
  return {
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radii.card,
    padding: t.spacing.lg,
    shadowColor: '#000',
    shadowOpacity: elevated ? 0.12 : 0.05,
    shadowRadius: elevated ? 16 : 3,
    shadowOffset: { width: 0, height: elevated ? 8 : 1 },
    elevation: elevated ? 6 : 2,
  }
}

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
  const user = useCurrentUser()
  const { source: spriteSource } = useProfileSprite()
  const { songs: starred, loading: starredLoading, error: starredError } = useStarredSongs()

  const greeting = `${timeGreeting()}, ${getDisplayName(user)}`
  const subGreeting = pickSubGreeting()

  // Recently-opened comes from on-device history (recorded by the Viewer);
  // the Last set card reads the real most-recently-edited setlist.
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
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: t.colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.3, color: t.colors.onAccent }}>
                    GC
                  </Text>
                </View>
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
          </LinearGradient>

          {/* Continue where you left off — overlaps up into the hero. Shown only
              when there is recent history. */}
          {continueSong ? (
            <View style={{ paddingHorizontal: t.spacing.lg, marginTop: -66 }}>
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
            </View>
          ) : null}
        </View>

        {/* ===== Last set — shown only if present ===== */}
        {lastSet ? (
          <View style={{ paddingHorizontal: t.spacing.lg, marginTop: 26 }}>
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
          </View>
        ) : null}

        {/* ===== Starred songs (real data) ===== */}
        <View style={{ marginTop: 28 }}>
          <View style={{ paddingHorizontal: t.spacing.xl }}>
            <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: t.colors.ink }}>
              Starred songs
            </Text>
          </View>

          {starredLoading ? (
            <ActivityIndicator color={t.colors.accent} style={{ marginTop: t.spacing.lg }} />
          ) : starredError ? (
            <Text style={{ paddingHorizontal: t.spacing.xl, marginTop: t.spacing.md, color: t.colors.muted }}>
              {starredError}
            </Text>
          ) : starred.length === 0 ? (
            <Text style={{ paddingHorizontal: t.spacing.xl, marginTop: t.spacing.md, fontSize: t.typography.body.fontSize, color: t.colors.muted }}>
              Songs you star will appear here.
            </Text>
          ) : (
            <View style={{ marginTop: t.spacing.sm }}>
              {starred.map((s: StarredSong) => (
                <ListRow
                  key={s.id}
                  title={s.title}
                  subtitle={s.artist}
                  trailingTop={s.default_key}
                  trailingBottom={s.time_signature}
                  onPress={() => openSong(s)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
