import { useEffect, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
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
import { flushPendingSprite } from '../src/lib/profile'
import { hydrateDefaults } from '../src/lib/defaults'
import { hydrateBibleTranslationPref } from '../src/lib/bibleTranslationPref'
import { prefetchToday } from '../src/lib/bibleSource'
import { hydrateDownloads } from '../src/lib/downloads/manifest'
import { hydrateDrafts } from '../src/lib/drafts/draftsStore'
import { hydrateRecents } from '../src/lib/recents'
import { hydrateReadingStreak } from '../src/lib/readingStreak'
import { hydrateViewerPrefs } from '../src/lib/viewerPrefs'

// Keep the native splash up past first render so we can resolve the persisted
// session and route to the right screen before anything is shown — the app is
// authenticated-users-only, and this prevents Home from flashing for a signed-
// out user on first open.
SplashScreen.preventAutoHideAsync().catch(() => {})

// Root layout: install the theme + safe-area providers, keep the native token
// auto-refresh, and gate routes on the auth session using the standard
// expo-router pattern — redirect to /login when signed out, and into the tabs
// once a session exists.
function useProtectedRoute(session: Session | null, ready: boolean) {
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (!ready) return
    const seg = segments[0] as string | undefined
    // choose-icon is the post-signup avatar step: it must stay visible both
    // WITH a session (confirm-email off signs in immediately — don't bounce to
    // Home before the pick) and WITHOUT one (confirmation pending).
    const inAuthFlow = seg === 'login' || seg === 'choose-icon'
    if (!session && !inAuthFlow) {
      router.replace('/login')
    } else if (session && seg === 'login') {
      router.replace('/')
    }
  }, [session, ready, segments, router])

  // Hide the splash only once the session is resolved AND the visible route
  // matches the auth state, so the native splash covers the redirect frame and
  // no wrong screen flashes. Fall back to hiding on `ready` so a stuck route can
  // never leave the splash up forever.
  useEffect(() => {
    if (!ready) return
    const seg = segments[0] as string | undefined
    const inAuthFlow = seg === 'login' || seg === 'choose-icon'
    const settled = session ? seg !== 'login' : inAuthFlow
    if (settled) SplashScreen.hideAsync().catch(() => {})
  }, [session, ready, segments])

  // Safety net: if routing never "settles" for some reason, don't leave the
  // splash up indefinitely once the session has resolved.
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 2000)
    return () => clearTimeout(id)
  }, [ready])
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

  useEffect(() => {
    // Missing public config: skip the session read entirely (the supabase client
    // is null here) and let the ConfigErrorScreen below take over.
    if (supabaseConfigError) return
    let stopAutoRefresh: (() => void) | undefined
    // Load app-wide defaults (theme/chord style) before the splash lifts so the
    // resolved theme is applied on first paint — no light→dark flash. Runs in
    // parallel with the session read; both must resolve before `ready`.
    // Hydrate device-local stores (defaults, download manifest, recent-song
    // history) alongside the session read. They must resolve before `ready` so
    // the first paint has the resolved theme, offline reads know what's
    // downloaded, and Home's "Continue" card can render synchronously.
    Promise.all([
      resolveInitialSession(supabase.auth),
      hydrateDefaults(AsyncStorage),
      hydrateDownloads(AsyncStorage),
      hydrateDrafts(AsyncStorage),
      hydrateRecents(AsyncStorage),
      hydrateReadingStreak(AsyncStorage),
      hydrateViewerPrefs(AsyncStorage),
      hydrateBibleTranslationPref(AsyncStorage),
    ]).then(([session, defaults]) => {
      // Apply the stored language pick (null = follow device) while the splash
      // is still up, so a non-device language never flashes on first paint.
      applyLanguagePreference(defaults.language)
      setSession(session)
      setReady(true)
      // Start AppState-driven token auto-refresh only AFTER the persisted
      // session is resolved. resolveInitialSession has already purged any
      // stale/revoked refresh token from storage, so the immediate refresh tick
      // can't fire against a dead token and log "Invalid Refresh Token: Refresh
      // Token Not Found" on launch.
      stopAutoRefresh = registerAuthAutoRefresh()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // A sprite picked before the session existed (email-confirmation flow,
      // or a transient write failure) is flushed on sign-in. Fire-and-forget:
      // a preference must never block auth.
      if (event === 'SIGNED_IN' && next?.user) {
        void flushPendingSprite(supabase, AsyncStorage, next.user.id)
      }
    })
    return () => {
      sub.subscription.unsubscribe()
      stopAutoRefresh?.()
    }
  }, [])

  // Warm today's Daily Word passages on open so the reader is instant even if
  // it isn't visited. Best-effort; clears + repulls on the first open of a new
  // day. Other dates load on demand via the date picker.
  useEffect(() => {
    if (session) prefetchToday()
  }, [session])

  useProtectedRoute(session, ready)

  if (supabaseConfigError) {
    return <ConfigErrorScreen message={supabaseConfigError} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="choose-icon" />
            <Stack.Screen name="viewer/[slug]" />
            <Stack.Screen name="setlist/import" />
            <Stack.Screen name="setlist/[id]" />
            <Stack.Screen name="perform/[id]" />
            <Stack.Screen name="settings" />
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
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
