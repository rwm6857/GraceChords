import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ThemeProvider } from '../src/theme/ThemeProvider'
import { registerAuthAutoRefresh, supabase } from '../src/lib/supabase'
import { flushPendingSprite } from '../src/lib/profile'
import { hydrateDefaults } from '../src/lib/defaults'
import { prefetchToday } from '../src/lib/bibleSource'
import { hydrateDownloads } from '../src/lib/downloads/manifest'
import { hydrateRecents } from '../src/lib/recents'

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

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => registerAuthAutoRefresh(), [])

  useEffect(() => {
    // Load app-wide defaults (theme/chord style) before the splash lifts so the
    // resolved theme is applied on first paint — no light→dark flash. Runs in
    // parallel with the session read; both must resolve before `ready`.
    // Hydrate device-local stores (defaults, download manifest, recent-song
    // history) alongside the session read. They must resolve before `ready` so
    // the first paint has the resolved theme, offline reads know what's
    // downloaded, and Home's "Continue" card can render synchronously.
    Promise.all([
      supabase.auth.getSession(),
      hydrateDefaults(AsyncStorage),
      hydrateDownloads(AsyncStorage),
      hydrateRecents(AsyncStorage),
    ]).then(([{ data }]) => {
      setSession(data.session)
      setReady(true)
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
    return () => sub.subscription.unsubscribe()
  }, [])

  // Warm today's Daily Word passages on open so the reader is instant even if
  // it isn't visited. Best-effort; clears + repulls on the first open of a new
  // day. Other dates load on demand via the date picker.
  useEffect(() => {
    if (session) prefetchToday()
  }, [session])

  useProtectedRoute(session, ready)

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="choose-icon" />
            <Stack.Screen name="viewer/[slug]" />
            <Stack.Screen name="setlist/[id]" />
            <Stack.Screen name="perform/[id]" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="about" />
            <Stack.Screen name="offline" />
          </Stack>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
