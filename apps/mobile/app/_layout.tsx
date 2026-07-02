import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { ThemeProvider } from '../src/theme/ThemeProvider'
import { registerAuthAutoRefresh, supabase } from '../src/lib/supabase'

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
    const inAuthGroup = segments[0] === 'login'
    if (!session && !inAuthGroup) {
      router.replace('/login')
    } else if (session && inAuthGroup) {
      router.replace('/')
    }
  }, [session, ready, segments, router])

  // Hide the splash only once the session is resolved AND the visible route
  // matches the auth state, so the native splash covers the redirect frame and
  // no wrong screen flashes. Fall back to hiding on `ready` so a stuck route can
  // never leave the splash up forever.
  useEffect(() => {
    if (!ready) return
    const inAuthGroup = segments[0] === 'login'
    const settled = session ? !inAuthGroup : inAuthGroup
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useProtectedRoute(session, ready)

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="viewer/[slug]" />
            <Stack.Screen name="setlist/[id]" />
            <Stack.Screen name="perform/[id]" />
          </Stack>
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
