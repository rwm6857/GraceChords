import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { Session } from '@supabase/supabase-js'
import { ThemeProvider } from '../src/theme/ThemeProvider'
import { registerAuthAutoRefresh, supabase } from '../src/lib/supabase'

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
    <ThemeProvider>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="viewer/[slug]" />
        </Stack>
      </SafeAreaProvider>
    </ThemeProvider>
  )
}
