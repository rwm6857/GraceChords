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
import AutoFitChart from '../components/AutoFitChart'
import type { ChordStyle } from '../components/ChordChart'
import HeaderIconButton from '../components/HeaderIconButton'
import VerseChart from '../components/VerseChart'
import Screen from '../components/Screen'
import SymbolIcon from '../components/SymbolIcon'
import ViewOptionsSheet, {
  type Accidental,
  defaultAccidental,
  resolvePreferFlat,
} from '../components/ViewOptionsSheet'
import { useTheme } from '../theme/ThemeProvider'
import { getDefaultsSnapshot, setDefaultKeepAwake, setDefaultTheme, useAppDefaults } from '../lib/defaults'
import { useChartAutoFit } from '../lib/useChartAutoFit'
import { useKeepAwakeWhileFocused } from '../lib/keepAwake'
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

// Native live-session follower. Mirrors the web follower
// (apps/web/src/pages/SessionViewerPage.jsx): one `sessions` row is the single
// source of truth (late-join snapshot + live stream via Realtime). Public songs
// render from the public catalog by slug; personal items show a placeholder.
// The JOIN CODE decides the tier — the chord code renders chords in the
// leader's live key, the lyric code renders lyrics only. Anonymous viewers are
// allowed (see the `session` whitelist in app/_layout.tsx).
//
// The chart is the Song Viewer's: AutoFitChart + the shared useChartAutoFit, so
// a follower gets the same auto-fitting size and tablet columns, driven by the
// same ViewOptionsSheet. What it deliberately does NOT get is anything that
// would fight the leader — no transpose, no key picker, no gestures. Nothing a
// follower changes leaves this device.
//
// The header does not auto-hide (the Viewer's one remaining option): it is the
// live-state indicator — LIVE, the current title, the reconnect banner — so
// hiding it after a few idle seconds would hide exactly what a follower checks
// when they look up. That also keeps headerH at 0 for auto-fit, since the
// chart starts below a static header rather than under a floating one.
export default function SessionFollowerScreen({ code }: { code: string }) {
  const t = useTheme()
  const { t: tx } = useTranslation(['setlist', 'song'])
  const router = useRouter()

  const [session, setSession] = useState<SessionRow | null>(null)
  const [tier, setTier] = useState<'chord' | 'lyric'>('lyric')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [connected, setConnected] = useState(true)
  const [staleReconnect, setStaleReconnect] = useState(false)

  const [displayedUid, setDisplayedUid] = useState<string | null>(null)
  const [autoFollow, setAutoFollow] = useState(true)

  // View options — the same set the Song Viewer offers, minus anything that
  // would fight the leader (no transpose, no key picker: the session owns the
  // key). All session-ephemeral except the column ceiling and keep-awake,
  // which are the app's own persisted preferences.
  const [sheet, setSheet] = useState<null | 'options'>(null)
  const [showChordsPref, setShowChordsPref] = useState(true)
  const [showSections, setShowSections] = useState(true)
  const [chordStyle, setChordStyle] = useState<ChordStyle>(() => getDefaultsSnapshot().chordStyle)
  const [accidental, setAccidental] = useState<Accidental>('sharp')
  const accidentalTouched = useRef(false)
  const [chartAreaH, setChartAreaH] = useState(0)

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
  // The TIER decides whether chords exist here at all (the lyric join code is
  // the congregation's); on the chord tier the follower may still hide them.
  const isChordTier = tier === 'chord'
  const showChords = isChordTier && showChordsPref
  const steps = isChordTier ? ((((session?.transpose || 0) % 12) + 12) % 12) : 0
  // Spelling follows the leader's key until the follower flips it themselves.
  const leaderKey = session?.current_key || ''
  const preferFlat = resolvePreferFlat(accidental)
  useEffect(() => {
    if (!accidentalTouched.current) setAccidental(defaultAccidental(leaderKey))
  }, [leaderKey])
  const setAccidentalManual = (v: Accidental) => {
    accidentalTouched.current = true
    setAccidental(v)
  }
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

  // The follower has no Settings access (an anonymous viewer never sees the tab
  // shell), so the toggle writes the app-wide preference directly — there is one
  // theme source of truth and this is it.
  const toggleTheme = () => setDefaultTheme(t.mode === 'dark' ? 'light' : 'dark')

  // Keep-awake: the same persisted preference the Viewer/Performer share, held
  // only while this screen is focused. A follower on a stand for a whole set is
  // exactly the case it exists for.
  const { keepAwake } = useAppDefaults()
  useKeepAwakeWhileFocused(keepAwake)

  // Column ceiling + auto-fit font, the same wiring the Viewer and Performer
  // use. The header here is static (it carries live state, so it never hides),
  // which is why headerH is 0: the ScrollView already starts below it.
  const autoFit = useChartAutoFit({
    chartAreaH,
    headerH: 0,
    horizontalPadding: t.spacing.lg,
    columnGap: t.spacing.lg,
    topGap: t.spacing.lg,
    chromeVisible: true,
  })

  // ---------- Render ----------
  if (phase === 'loading') {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={t.colors.accent} />
          <Text style={{ marginTop: t.spacing.md, color: t.colors.sec }}>
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
          <Text style={{ color: t.colors.sec, textAlign: 'center', marginBottom: 18 }}>
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
          <Text style={{ color: t.colors.sec, marginBottom: 18 }}>
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
        {/* The one deliberately hardcoded colour in the app, kept as an explained
            exception rather than forced into the palette:

            • It is theme-INVARIANT on purpose — a "live" indicator that reads the
              same in light and dark. Every token in ThemeColors is a light/dark
              pair, so a token whose two values were identical would assert a theme
              relationship that does not exist here.
            • It is not `danger`. That token means destructive (delete, error) and
              is used as such across a dozen surfaces; "broadcasting" is not
              "destructive", and the palette has no rose family to borrow from.
            • One call site. Adding a token would mean editing packages/tokens —
              shared with apps/web — and regenerating the committed Swift mirror
              for apps/studio (npm run tokens:swift, guarded by :check in CI), for
              an 8pt dot neither app would use.

            Decorative: the localized "LIVE" text beside it carries the meaning, so
            VoiceOver correctly skips this bare View and WCAG 1.4.11 does not apply.
            Note apps/web draws the same dot at 9px (SessionViewerPage.jsx) — the
            hand-copied literal has already drifted, which is the argument for a
            real token if this ever gains a second use here. */}
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0245e' }} />
        <Text style={{ fontWeight: '800', letterSpacing: 0.4, color: t.colors.ink }}>
          {tx('setlist:sessionFollower.live')}
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, color: t.colors.sec }}>
          {displayedItem?.title || ''}
        </Text>

        {/* Reader controls — in the follower's own hands: nothing here is
            broadcast, so the leader's view and every other follower are
            untouched. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <HeaderIconButton
            icon="circle.lefthalf.filled"
            iconSize={19}
            label={tx('setlist:sessionFollower.toggleTheme')}
            onPress={toggleTheme}
          />
          <HeaderIconButton
            icon="ellipsis"
            label={tx('song:viewer.viewOptions')}
            onPress={() => setSheet('options')}
          />
        </View>
      </View>

      {!connected ? (
        <View style={{ paddingVertical: 6, alignItems: 'center', backgroundColor: t.colors.accentSoft }}>
          <Text style={{ fontSize: 13, color: t.colors.textAccent }}>
            {staleReconnect ? tx('setlist:sessionFollower.waiting') : tx('setlist:sessionFollower.reconnecting')}
          </Text>
        </View>
      ) : null}

      {/* Content. The wrapper is measured so auto-fit knows the height it has
          to fill; the reconnect banner above it shrinks that, as it should. */}
      <View style={{ flex: 1 }} onLayout={(e) => setChartAreaH(e.nativeEvent.layout.height)}>
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={64}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingTop: autoFit.paddingTop,
            paddingBottom: t.spacing.xxl * 2,
          }}
        >
          {isVerse && displayedItem?.ref ? (
            <VerseChart verseRef={displayedItem.ref} fontScale={autoFit.effectiveFontScale} />
          ) : displayedItem && !isSong ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: t.colors.ink, marginBottom: 6 }}>
                {displayedItem.title || ''}
              </Text>
              <Text style={{ color: t.colors.sec }}>{tx('setlist:sessionFollower.unavailable')}</Text>
            </View>
          ) : doc ? (
            <AutoFitChart
              doc={doc}
              steps={steps}
              preferFlat={preferFlat}
              showChords={showChords}
              showSections={showSections}
              fontScale={autoFit.fontScale}
              chordStyle={chordStyle}
              maxColumns={autoFit.columns}
              viewportHeight={autoFit.viewportHeight}
              viewportHeightChromeHidden={autoFit.viewportHeightChromeHidden}
              onPlan={autoFit.onPlan}
              // Published bodies are immutable within a session, so the leader
              // moving back to an earlier song re-uses its measured heights.
              cacheId={displayedItem?.slug}
            />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator color={t.colors.accent} />
              <Text style={{ marginTop: t.spacing.md, color: t.colors.sec }}>
                {tx('setlist:sessionFollower.loadingSong')}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

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

      {/* Same sheet the Viewer and Performer use. Chords, chord style and
          accidentals are wired on the chord tier only — on the lyric tier there
          are no chords on screen for them to act on. */}
      <ViewOptionsSheet
        visible={sheet === 'options'}
        onClose={() => setSheet(null)}
        showChords={isChordTier ? showChordsPref : undefined}
        onShowChords={isChordTier ? setShowChordsPref : undefined}
        showSections={showSections}
        onShowSections={setShowSections}
        fontScale={autoFit.effectiveFontScale}
        fontAuto={autoFit.fontAuto}
        onFontScale={autoFit.onFontScale}
        chordStyle={isChordTier ? chordStyle : undefined}
        onChordStyle={isChordTier ? setChordStyle : undefined}
        accidental={isChordTier ? accidental : undefined}
        onAccidental={isChordTier ? setAccidentalManual : undefined}
        columns={autoFit.maxColumns > 1 ? autoFit.columns : undefined}
        onColumns={autoFit.maxColumns > 1 ? autoFit.setColumns : undefined}
        maxColumns={autoFit.maxColumns}
        keepAwake={keepAwake}
        onKeepAwake={setDefaultKeepAwake}
      />
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
