import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createGcSupabase } from '@gracechords/core'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// If the public Supabase env vars are missing, DO NOT throw at module import:
// a top-level throw aborts the whole JS bundle before React (and any error
// boundary) can mount, which on a release build is an instant, unexplained
// SIGABRT crash on launch. The classic cause is a release/TestFlight build made
// without the EXPO_PUBLIC_* vars (a gitignored .env never reaches an EAS cloud
// build — set them as EAS environment variables instead). Surface the problem
// as a value the app root can render as a readable screen.
export const supabaseConfigError: string | null =
  !url || !anonKey
    ? 'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY.\n\n' +
      'For local/simulator builds: copy apps/mobile/.env.example to ' +
      'apps/mobile/.env and fill in the values.\n\n' +
      'For TestFlight/EAS builds: a gitignored .env is NOT uploaded to the ' +
      'cloud build — set these as EAS environment variables ' +
      '(eas env:create --environment production ...).'
    : null

// Consume the SAME core factory the web app uses. We inject AsyncStorage as the
// native session store; persistSession + autoRefreshToken default to true in
// the factory. detectSessionInUrl is irrelevant on native (no URL redirect),
// so turn it off — the factory defaults it to true for the web.
//
// When config is missing we skip client creation (createClient itself throws on
// an undefined url) and export a null client. The app root short-circuits to the
// config-error screen in that case, so this client is never actually used.
export const supabase: SupabaseClient = supabaseConfigError
  ? (null as unknown as SupabaseClient)
  : createGcSupabase({
      url: url as string,
      anonKey: anonKey as string,
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
