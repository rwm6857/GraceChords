import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { SongDoc } from '@gracechords/core'
import { fetchSessionByCode, parseChordProOrLegacy, subscribeToSession } from '@gracechords/core'
import ChordChart from '../components/ChordChart'
import VerseChart from '../components/VerseChart'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import { useTheme } from '../theme/ThemeProvider'
import { supabase } from '../lib/supabase'
import { prefetchSong, useSong } from '../lib/useSong'

// After this long without any realtime signal following a drop, soften the
// "reconnecting" hint (we still HOLD the last-known state either way).
const GRACE_MS = 50_000

type SnapshotItem = {
  uid: string
  kind: 'song' | 'verse' | 'unavailable'
  slug?: string
  title?: string
  ref?: string
  reason?: string
}
type SessionRow = {
  id: string
  code: string
  chord_code?: string | null
  tier?: 'chord' | 'lyric'
  status: 'live' | 'ended'
  items: SnapshotItem[]
  current_item_uid: string | null
  transpose?: number
  current_key?: string | null
}

// Native, LYRICS-ONLY live-session follower. Mirrors the web follower
// (apps/web/src/pages/SessionViewerPage.jsx): one `sessions` row is the single
// source of truth (late-join snapshot + live stream via Realtime). Public songs
// render from the public catalog by slug with chords suppressed; personal/verse
// items show a placeholder. No transposer, no key/change gestures — the follower
// only follows. Anonymous viewers are allowed (see the `session` whitelist in
// app/_layout.tsx).
export default function SessionFollowerScreen({ code }: { code: string }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist'])
  const router = useRouter()

  const [session, setSession] = useState<SessionRow | null>(null)
  const [tier, setTier] = useState<'chord' | 'lyric'>('lyric')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [connected, setConnected] = useState(true)
  const [staleReconnect, setStaleReconnect] = useState(false)

  const [displayedUid, setDisplayedUid] = useState<string | null>(null)
  const [autoFollow, setAutoFollow] = useState(true)

  const scrollRef = useRef<ScrollView | null>(null)
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Late-join: fetch the row once, then subscribe for live updates. On (re)connect
  // re-fetch so a reconnect resyncs anything missed while disconnected.
  useEffect(() => {
    if (!code) return
    let alive = true
    let unsubscribe = () => {}

    ;(async () => {
      let row: SessionRow | null
      try {
        row = (await fetchSessionByCode(supabase, code)) as SessionRow | null
      } catch {
        if (alive) setPhase('notfound')
        return
      }
      if (!alive) return
      if (!row) {
        setPhase('notfound')
        return
      }
      setSession(row)
      setTier(row.tier === 'chord' ? 'chord' : 'lyric')
      setPhase('ready')
      unsubscribe = subscribeToSession(supabase, row.id, {
        onChange: (next) => {
          if (alive) setSession(next as SessionRow)
        },
        onStatus: (status) => {
          if (!alive) return
          if (status === 'SUBSCRIBED') {
            setConnected(true)
            setStaleReconnect(false)
            fetchSessionByCode(supabase, code)
              .then((r) => { if (alive && r) setSession(r as SessionRow) })
              .catch(() => {})
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnected(false)
          }
        },
      })
    })()

    return () => {
      alive = false
      unsubscribe()
    }
  }, [code])

  // First-ever RN Realtime consumer: the socket drops when backgrounded. On
  // return to foreground, re-fetch to resync (the channel re-subscribes itself).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && code) {
        fetchSessionByCode(supabase, code)
          .then((r) => { if (r) setSession(r as SessionRow) })
          .catch(() => {})
      }
    })
    return () => sub.remove()
  }, [code])

  // Grace window: after a drop, soften the hint but keep holding state.
  useEffect(() => {
    if (connected) {
      setStaleReconnect(false)
      if (graceTimer.current) clearTimeout(graceTimer.current)
      return
    }
    graceTimer.current = setTimeout(() => setStaleReconnect(true), GRACE_MS)
    return () => { if (graceTimer.current) clearTimeout(graceTimer.current) }
  }, [connected])

  const leaderUid = session?.current_item_uid || null
  const behind = phase === 'ready' && !!displayedUid && leaderUid !== displayedUid

  // Follow the leader: advance the displayed item when auto-following.
  useEffect(() => {
    if (!session) return
    if (autoFollow) {
      setDisplayedUid(session.current_item_uid || null)
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.current_item_uid, autoFollow])

  const items = useMemo<SnapshotItem[]>(() => session?.items || [], [session])
  const displayedItem = useMemo(
    () => items.find((it) => it.uid === displayedUid) || items[0] || null,
    [items, displayedUid],
  )

  // Warm every public-song body on join so item changes render instantly.
  useEffect(() => {
    for (const it of items) if (it.kind === 'song' && it.slug) prefetchSong(it.slug)
  }, [items])

  const isSong = displayedItem?.kind === 'song'
  const isVerse = displayedItem?.kind === 'verse'
  // Chord tier renders chords in the leader's live key; lyric tier is lyrics-only.
  const showChords = tier === 'chord'
  const steps = showChords ? ((((session?.transpose || 0) % 12) + 12) % 12) : 0
  const preferFlat = String(session?.current_key || '').includes('b')
  const { song } = useSong(isSong ? displayedItem?.slug : undefined)
  const songReady = !!(song && isSong && song.slug === displayedItem?.slug)

  const doc = useMemo<SongDoc | null>(() => {
    if (!songReady || !song?.chordpro_content) return null
    try {
      return parseChordProOrLegacy(song.chordpro_content)
    } catch {
      return null
    }
  }, [songReady, song])

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    if (y > 40 && autoFollow) setAutoFollow(false)
    else if (y <= 4 && !autoFollow && !behind) setAutoFollow(true)
  }

  const catchUp = () => {
    setAutoFollow(true)
    setDisplayedUid(leaderUid)
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }

  const goHome = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  // ---------- Render ----------
  if (phase === 'loading') {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={t.colors.accent} />
          <Text style={{ marginTop: t.spacing.md, color: t.colors.muted }}>
            {tx('setlist:sessionFollower.joining')}
          </Text>
        </View>
      </Screen>
    )
  }

  if (phase === 'notfound') {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: t.colors.ink, marginBottom: 8 }}>
            {tx('setlist:sessionFollower.notFoundTitle')}
          </Text>
          <Text style={{ color: t.colors.muted, textAlign: 'center', marginBottom: 18 }}>
            {tx('setlist:sessionFollower.notFoundBody')}
          </Text>
          <Pressable onPress={goHome} style={pillStyle(t)}>
            <Text style={{ color: t.colors.onAccent, fontWeight: '700' }}>
              {tx('setlist:sessionFollower.home')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  if (session?.status === 'ended') {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: t.colors.ink, marginBottom: 10, textAlign: 'center' }}>
            {tx('setlist:sessionFollower.endedTitle')}
          </Text>
          <Text style={{ color: t.colors.muted, marginBottom: 18 }}>
            {tx('setlist:sessionFollower.endedBody')}
          </Text>
          <Pressable onPress={goHome} style={pillStyle(t)}>
            <Text style={{ color: t.colors.onAccent, fontWeight: '700' }}>
              {tx('setlist:sessionFollower.home')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border,
        }}
      >
        <Pressable onPress={goHome} hitSlop={8} accessibilityRole="button" accessibilityLabel={tx('setlist:sessionFollower.home')}>
          <SymbolIcon name="chevron.left" size={22} color={t.colors.accent} />
        </Pressable>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0245e' }} />
        <Text style={{ fontWeight: '800', letterSpacing: 0.4, color: t.colors.ink }}>
          {tx('setlist:sessionFollower.live')}
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, color: t.colors.sec }}>
          {displayedItem?.title || ''}
        </Text>
      </View>

      {!connected ? (
        <View style={{ paddingVertical: 6, alignItems: 'center', backgroundColor: t.colors.accentSoft }}>
          <Text style={{ fontSize: 13, color: t.colors.textAccent }}>
            {staleReconnect ? tx('setlist:sessionFollower.waiting') : tx('setlist:sessionFollower.reconnecting')}
          </Text>
        </View>
      ) : null}

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={64}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxl * 2 }}
      >
        {isVerse && displayedItem?.ref ? (
          <VerseChart verseRef={displayedItem.ref} />
        ) : displayedItem && !isSong ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: t.colors.ink, marginBottom: 6 }}>
              {displayedItem.title || ''}
            </Text>
            <Text style={{ color: t.colors.muted }}>{tx('setlist:sessionFollower.unavailable')}</Text>
          </View>
        ) : doc ? (
          <ChordChart doc={doc} steps={steps} preferFlat={preferFlat} showChords={showChords} />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={t.colors.accent} />
            <Text style={{ marginTop: t.spacing.md, color: t.colors.muted }}>
              {tx('setlist:sessionFollower.loadingSong')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Catch-up pill */}
      {behind ? (
        <Pressable
          onPress={catchUp}
          accessibilityRole="button"
          style={{
            position: 'absolute',
            bottom: 28,
            alignSelf: 'center',
            backgroundColor: t.colors.accent,
            borderRadius: t.radii.pill,
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: t.colors.onAccent, fontWeight: '700' }}>
            {tx('setlist:sessionFollower.catchUp')}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  )
}

const styles = {
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
  },
}

function pillStyle(t: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: t.colors.accent,
    borderRadius: t.radii.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
  }
}
