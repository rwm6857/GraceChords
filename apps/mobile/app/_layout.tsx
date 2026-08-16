import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Platform, ScrollView, Text, View } from 'react-native'
import * as Font from 'expo-font'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { endSession, fetchActiveSessionForController } from '@gracechords/core'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { radii } from '@gracechords/tokens/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyLanguagePreference } from '../src/i18n'
import { ThemeProvider, ThemedStatusBar } from '../src/theme/ThemeProvider'
import {
  registerAuthAutoRefresh,
  supabase,
  supabaseConfigError,
} from '../src/lib/supabase'
import { resolveInitialSession } from '../src/lib/authSession'
import { setCurrentUserFromSession } from '../src/lib/currentUser'
import { flushPendingSprite } from '../src/lib/profile'
import { primeLaunchStorage } from '../src/lib/launchStorage'
import { hydrateDefaults } from '../src/lib/defaults'
import { hydrateIntroSeen, useIntroSeen } from '../src/lib/introSeen'
import { startReviewSession, useReviewObserver } from '../src/lib/reviewService'
import { hydrateBibleTranslationPref } from '../src/lib/bibleTranslationPref'
import { hydrateReaderSettings } from '../src/lib/readerSettings'
import { prefetchToday } from '../src/lib/bibleSource'
import { hydrateDownloads } from '../src/lib/downloads/manifest'
import { hydrateDrafts } from '../src/lib/drafts/draftsStore'
import { hydrateRecents } from '../src/lib/recents'
import { hydrateReadingStreak } from '../src/lib/readingStreak'
import { clearReflectionDays, hydrateTodayReflection } from '../src/lib/reflectionDayStore'
import { hydrateReaderReminder } from '../src/lib/readerReminder'
import { syncDevotionals } from '../src/lib/devotionals/sync'
import {
  addReminderResponseListener,
  initReaderReminders,
  syncReaderReminderOnLaunch,
} from '../src/lib/readerReminderService'
import { hydrateViewerPrefs } from '../src/lib/viewerPrefs'
import { setFocusedRouteKey } from '../src/lib/topRoute'
import { startAccessibilityFlags } from '../src/lib/accessibilityFlagsService'
import { applyOrientationLock } from '../src/lib/orientationLock'
import { useAccessibilityFlags } from '../src/lib/accessibilityFlags'
import SplashOverlay from '../src/components/SplashOverlay'

// Keep the native splash up past first render so we can resolve the persisted
// session and route to the right screen before anything is shown — the app is
// authenticated-users-only, and this prevents Home from flashing for a signed-
// out user on first open.
SplashScreen.preventAutoHideAsync().catch(() => {})

/**
 * Whether the first-launch intro (app/intro.tsx) should take over this route.
 *
 * Deliberately scoped to the app's OWN entry points — the bare root and the tab
 * group — rather than "any route that isn't the intro". A deep link resolves to a
 * specific screen (`viewer/[slug]`, `setlist/import`, the anonymous
 * `session/[code]` follower), and hijacking that to show the intro would discard
 * the destination the link was for. Leaving the flag unset instead means the
 * intro simply shows on the next ordinary launch, which costs nothing.
 *
 * The `login` hand-off is NOT routed through here — it has its own branch,
 * because it must send the user to the intro or the tabs, never leave them on
 * /login. `choose-icon` is excluded so the post-signup avatar step is never
 * interrupted mid-pick; its own replace('/') lands on the tab group and is
 * caught here on the next pass.
 */
function wantsIntro(
  session: Session | null,
  seenIntro: boolean,
  seg: string | undefined,
): boolean {
  if (!session || seenIntro) return false
  return seg === undefined || seg === '(tabs)'
}

// Root layout: install the theme + safe-area providers, keep the native token
// auto-refresh, and gate routes on the auth session using the standard
// expo-router pattern — redirect to /login when signed out, and into the tabs
// once a session exists.
function useProtectedRoute(session: Session | null, ready: boolean, beginHandoff: () => void) {
  const segments = useSegments()
  const router = useRouter()
  // Device-local first-launch flag. Subscribed (not just read) so setting it from
  // the intro re-runs the effects below with `seenIntro` already true — otherwise
  // the redirect would fire again against the intro's own navigation.
  const seenIntro = useIntroSeen()

  useEffect(() => {
    if (!ready) return
    const seg = segments[0] as string | undefined
    // choose-icon is the post-signup avatar step: it must stay visible both
    // WITH a session (confirm-email off signs in immediately — don't bounce to
    // Home before the pick) and WITHOUT one (confirmation pending).
    const inAuthFlow = seg === 'login' || seg === 'choose-icon'
    // `session/[code]` is the anonymous live-session follower — a logged-out app
    // user must be able to view it without being bounced to /login.
    const isPublic = seg === 'session'
    if (!session && !inAuthFlow && !isPublic) {
      router.replace('/login')
    } else if (session && seg === 'login') {
      // The intro is post-auth: a first launch lands there instead of the tabs.
      router.replace(seenIntro ? '/' : '/intro')
    } else if (wantsIntro(session, seenIntro, seg)) {
      router.replace('/intro')
    }
  }, [session, ready, segments, router, seenIntro])

  // Lift the splash only once the session is resolved AND the visible route
  // matches the auth state, so the native splash covers the redirect frame and
  // no wrong screen flashes. Fall back to lifting on `ready` so a stuck route can
  // never leave the splash up forever.
  //
  // `beginHandoff` mounts SplashOverlay, which calls hideAsync() itself once it
  // has painted over the native splash — see SplashOverlay.tsx. It is one-way, so
  // the repeat calls this effect makes as routes change are no-ops.
  useEffect(() => {
    if (!ready) return
    const seg = segments[0] as string | undefined
    const inAuthFlow = seg === 'login' || seg === 'choose-icon'
    const isPublic = seg === 'session'
    // A signed-in first launch is not settled while the gate above still wants
    // to replace this route with the intro — lifting the splash first would
    // flash the tab group for a frame. Once /intro is mounted wantsIntro is
    // false, so this settles normally.
    const settled = session
      ? seg !== 'login' && !wantsIntro(session, seenIntro, seg)
      : (inAuthFlow || isPublic)
    if (settled) beginHandoff()
  }, [session, ready, segments, beginHandoff, seenIntro])

  // Safety net: if routing never "settles" for some reason, don't leave the
  // splash up indefinitely once the session has resolved. Note this can only arm
  // once `ready` is true, so it rescues a stuck ROUTE, never a stuck hydration —
  // the hydration bound lives in resolveInitialSession's timeout instead. It has
  // to stay gated this way: lifting the splash before the session is known would
  // paint Home (or a deep-linked screen) before the gate above can redirect.
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(beginHandoff, 2000)
    return () => clearTimeout(id)
  }, [ready, beginHandoff])

  // Mirror the focused route for app/+native-intent.tsx, which runs outside React
  // and needs to know whether an inbound deep link would stack a second copy of
  // the route already on screen. See src/lib/topRoute.ts.
  useEffect(() => {
    setFocusedRouteKey(segments.length ? segments.join('/') : null)
  }, [segments])
}

// Shown instead of the app when required public config is missing (e.g. a
// release/TestFlight build made without the EXPO_PUBLIC_* env vars). Better a
// readable message than an instant, unexplained crash on launch.
function ConfigErrorScreen({ message }: { message: string }) {
  useEffect(() => {
    // The auth gate never resolves here, so lift the native splash ourselves.
    SplashScreen.hideAsync().catch(() => {})
  }, [])
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#14171A',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 20,
            fontWeight: '700',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          Configuration missing
        </Text>
        <Text
          style={{
            color: '#B7C0C9',
            fontSize: 15,
            lineHeight: 22,
            textAlign: 'center',
          }}
        >
          {message}
        </Text>
      </ScrollView>
    </View>
  )
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  // Drives the native-splash → app handoff, one way only: 'held' (native splash
  // still up) → 'handoff' (SplashOverlay mounted; it lifts the native splash and
  // animates itself away) → 'done'. The gate below can call beginHandoff again on
  // later navigations — 'done' must swallow those so the overlay can't reappear
  // over a running app.
  const [splashPhase, setSplashPhase] = useState<'held' | 'handoff' | 'done'>('held')
  const beginHandoff = useCallback(
    () => setSplashPhase((phase) => (phase === 'held' ? 'handoff' : phase)),
    [],
  )
  const endHandoff = useCallback(() => setSplashPhase('done'), [])
  const router = useRouter()
  const { t: tx } = useTranslation(['setlist', 'common'])
  const resumeChecked = useRef(false)
  const { reduceMotion } = useAccessibilityFlags()

  useEffect(() => {
    // Missing public config: skip the session read entirely (the supabase client
    // is null here) and let the ConfigErrorScreen below take over.
    if (supabaseConfigError) return
    let stopAutoRefresh: (() => void) | undefined
    // Lock orientation per device class: phones stay portrait, tablets rotate
    // (unblocks the tablet UI on Android — see orientationLock.ts). Fire-and-
    // forget; it must not gate the splash.
    applyOrientationLock()
    // Install the notification foreground handler / Android channel once, before
    // any reminder is (re)scheduled below.
    initReaderReminders()
    // Check R2 for changed devotional months. Fire-and-forget and deliberately
    // NOT part of the Promise.all below: it must never gate the splash, and a
    // failure is invisible. Self-throttled to at most once a day, so this costs
    // nothing on a normal launch. Today's content is fetched on demand by the
    // devotional read path, not here.
    void syncDevotionals()
    // Begin tracking the OS accessibility settings (Reduce Motion / Increase
    // Contrast / Differentiate Without Color). `ready` joins the splash hold
    // below so the first paint already reflects any enabled setting; `stop`
    // removes the OS listeners on unmount.
    const a11y = startAccessibilityFlags()
    // Hydrate the device-local stores (defaults, download manifest, recent-song
    // history, …) alongside the session read. They must all resolve before
    // `ready` so the first paint has the resolved theme (no light→dark flash),
    // offline reads know what's downloaded, and Home's "Continue" card can render
    // synchronously.
    //
    // Start the session read FIRST so it still overlaps the storage work below.
    // primeLaunchStorage awaits a multiGet before any store hydrates, and if the
    // session read were nested behind it the two would serialise and cold launch
    // would regress — the whole point of batching is to be no slower.
    const sessionRead = resolveInitialSession(supabase.auth)
    // One AsyncStorage round trip for all 15 launch keys instead of 15 separate
    // getItem calls. The stores themselves are untouched: they receive a
    // KVStorage that answers from the batch, so every missing/null/malformed
    // fallback is byte-for-byte what it was. See launchStorage.ts.
    const primed = primeLaunchStorage(AsyncStorage)
    const hydrated = primed.then((store) =>
      Promise.all([
        hydrateDefaults(store),
        hydrateDownloads(store),
        hydrateDrafts(store),
        hydrateRecents(store),
        hydrateReadingStreak(store),
        hydrateReaderReminder(store),
        hydrateViewerPrefs(store),
        hydrateBibleTranslationPref(store),
        // Daily Word reader typography (size / typeface / verse layout / line
        // spacing). Gates the splash like the rest so the reader's first paint
        // is already at the user's chosen size — no flash of the default.
        hydrateReaderSettings(store),
        // Today's cached reflection, so the Daily Word landing paints the card
        // it already knows about instead of spinning. Does NOT need to be
        // ordered against sessionRead: the stored entry names its own owner and
        // is only found by a lookup for that same user (reflectionDayStore.ts).
        hydrateTodayReflection(store),
        // Must resolve before `ready` — the auth gate reads it synchronously to
        // decide between /intro and the tabs while the splash is still up.
        hydrateIntroSeen(store),
      ]),
    )
    // In-app review bookkeeping (src/lib/reviewService.ts). Deliberately its own
    // chain rather than a member of the splash gate below: nothing on screen
    // depends on it, and the review gate cannot fire until the user has
    // navigated somewhere. It waits on `hydrated` only so the intro flag is
    // resolved before it snapshots "was the intro already seen BEFORE this
    // launch" — the whole point of that gate is to exclude a first run.
    void Promise.all([primed, hydrated])
      .then(([store]) => startReviewSession(store))
      .catch(() => {})
    Promise.all([
      sessionRead,
      hydrated,
      // Load the Material Symbols subset fonts before the splash lifts so
      // Android never paints a missing glyph on first frame. iOS renders icons
      // through SF Symbols natively (SymbolIcon), so there is nothing to load
      // there — skip it to keep the iOS launch path byte-for-byte unchanged.
      // Swallow a load failure: every other member of this Promise.all already
      // resolves to a default on error, and this is the only one that can reject.
      // A missing glyph is a far better outcome than a splash held forever.
      Platform.OS === 'android'
        ? Font.loadAsync({
            MaterialSymbolsOutlined: require('../assets/fonts/MaterialSymbolsOutlined.ttf'),
            MaterialSymbolsFilled: require('../assets/fonts/MaterialSymbolsFilled.ttf'),
          }).catch(() => {})
        : Promise.resolve(),
      // Resolve the initial accessibility-flag query before the splash lifts so
      // the contrast overlay (if enabled) is applied on first paint — no flash.
      a11y.ready,
    ])
      .then(([session, [defaults]]) => {
        // Apply the stored language pick (null = follow device) while the splash
        // is still up, so a non-device language never flashes on first paint.
        applyLanguagePreference(defaults.language)
        setSession(session)
        // Publish the resolved user to the shared store BEFORE `ready` flips, so
        // any screen that mounts already sees a resolved auth state. This is the
        // only source of user identity in the app — see src/lib/currentUser.ts.
        setCurrentUserFromSession(session)
        setReady(true)
        // Reconcile the OS-scheduled Daily Word reminder with the stored
        // preference now that it (and the language) are loaded. Best-effort.
        void syncReaderReminderOnLaunch()
        // Start AppState-driven token auto-refresh only AFTER the persisted
        // session is resolved. resolveInitialSession has already purged any
        // stale/revoked refresh token from storage, so the immediate refresh tick
        // can't fire against a dead token and log "Invalid Refresh Token: Refresh
        // Token Not Found" on launch.
        stopAutoRefresh = registerAuthAutoRefresh()
      })
      // Every member above already resolves to a default on failure, so this is
      // a backstop rather than a live failure path — but it was the one
      // unprotected join in the launch path, and a rejection here would leave
      // `ready` false forever. The 2 s route safety net below cannot help: it is
      // gated on `if (!ready) return`, so it never arms. Same reasoning as build
      // 12's Font.loadAsync().catch — lifting the splash into a signed-out app
      // with default preferences beats holding it indefinitely.
      .catch(() => setReady(true))
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setCurrentUserFromSession(next)
      // A sprite picked before the session existed (email-confirmation flow,
      // or a transient write failure) is flushed on sign-in. Fire-and-forget:
      // a preference must never block auth.
      if (event === 'SIGNED_IN' && next?.user) {
        void flushPendingSprite(supabase, AsyncStorage, next.user.id)
      }
      // A reflection is private journal text, and caching it to disk is only
      // defensible if signing out takes it back off again. The in-memory copy is
      // keyed by user id and so could never be shown to the next account, but
      // the persisted one should not outlive the session that wrote it.
      if (event === 'SIGNED_OUT') clearReflectionDays()
    })
    return () => {
      sub.subscription.unsubscribe()
      stopAutoRefresh?.()
      a11y.stop()
    }
  }, [])

  // Warm today's Daily Word passages on open so the reader is instant even if
  // it isn't visited. Best-effort; clears + repulls on the first open of a new
  // day. Other dates load on demand via the date picker.
  useEffect(() => {
    if (session) prefetchToday()
  }, [session])

  // On relaunch, if the leader has a session still marked live, offer to resume
  // it (jump back into the Performer, which re-adopts the row) or end it now.
  // Runs once per launch after auth resolves. Best-effort.
  useEffect(() => {
    if (!ready || !session || resumeChecked.current) return
    resumeChecked.current = true
    fetchActiveSessionForController(supabase)
      .then((row) => {
        if (!row) return
        Alert.alert(tx('setlist:resume.title'), tx('setlist:resume.message'), [
          {
            text: tx('setlist:resume.resume'),
            onPress: () => {
              if (row.setlist_id) router.push(`/perform/${row.setlist_id}`)
            },
          },
          {
            text: tx('setlist:resume.endNow'),
            style: 'destructive',
            onPress: () => {
              endSession(supabase, row.id).catch(() => {})
            },
          },
          { text: tx('setlist:resume.later'), style: 'cancel' },
        ])
      })
      .catch(() => {})
  }, [ready, session, router, tx])

  // Tapping the Daily Word reminder opens the reader tab. The auth gate still
  // applies — a signed-out tap lands on /login.
  useEffect(() => {
    return addReminderResponseListener((url) => {
      router.navigate(url as Parameters<typeof router.navigate>[0])
    })
  }, [router])

  useProtectedRoute(session, ready, beginHandoff)
  // Watches navigation + app lifecycle to time the in-app review request. Reads
  // navigation state only — the Song Viewer, Performer and Daily Word reader are
  // untouched and know nothing about it. See src/lib/reviewService.ts.
  useReviewObserver()

  if (supabaseConfigError) {
    return <ConfigErrorScreen message={supabaseConfigError} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          {/* Reduce Motion: swap the default slide push for a cross-fade
              (the HIG-preferred reduced-motion transition). Default settings
              keep the standard push animation. */}
          <Stack
            screenOptions={{
              headerShown: false,
              animation: reduceMotion ? 'fade' : 'default',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="choose-icon" />
            <Stack.Screen name="intro" />
            <Stack.Screen name="viewer/[slug]" />
            <Stack.Screen name="daily/reader" />
            <Stack.Screen name="daily/journal" />
            <Stack.Screen name="daily/reflection" />
            <Stack.Screen name="devotional/[date]/[slug]" />
            <Stack.Screen name="setlist/import" />
            <Stack.Screen name="setlist/[id]" />
            <Stack.Screen name="perform/[id]" />
            <Stack.Screen name="session/[code]" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="account/index" />
            <Stack.Screen name="account/password" />
            <Stack.Screen name="about" />
            <Stack.Screen name="offline" />
            <Stack.Screen name="tuner" />
            <Stack.Screen name="metronome" />
            <Stack.Screen name="pitch-pipe" />
            {/* Shared option-sheet route (src/lib/formSheetHost.ts): native
                formSheet so phones keep a bottom sheet with grabber/detents
                while tablets get the centered, naturally-narrow form sheet. */}
            <Stack.Screen
              name="sheet"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: 'fitToContents',
                sheetGrabberVisible: true,
                sheetCornerRadius: radii.sheet,
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </Stack>
          {/* Last sibling so it covers every route: the native splash hands off
              to this, then it zooms the mark out over the mounted app. */}
          {splashPhase === 'handoff' && <SplashOverlay onDone={endHandoff} />}
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
