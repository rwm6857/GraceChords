import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createGcSupabase } from '@gracechords/core'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy apps/mobile/.env.example to apps/mobile/.env and fill in the values.',
  )
}

// Consume the SAME core factory the web app uses. We inject AsyncStorage as the
// native session store; persistSession + autoRefreshToken default to true in
// the factory. detectSessionInUrl is irrelevant on native (no URL redirect),
// so turn it off — the factory defaults it to true for the web.
export const supabase = createGcSupabase({
  url,
  anonKey,
  storage: AsyncStorage,
  auth: {
    detectSessionInUrl: false,
  },
})

// Supabase only refreshes tokens while the tab/app is foregrounded. On native
// there is no tab visibility event, so drive it from AppState: refresh while
// active, pause while backgrounded. Call once at app root.
export function registerAuthAutoRefresh() {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh()
    } else {
      supabase.auth.stopAutoRefresh()
    }
  })
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh()
  }
  return () => sub.remove()
}
