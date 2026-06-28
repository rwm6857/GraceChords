import { createClient } from '@supabase/supabase-js'

// Platform-agnostic Supabase factory. Callers inject the env values and a
// storage adapter (web: cookieStorage; mobile: AsyncStorage/SecureStore), so
// core never touches import.meta.env or browser globals — and nothing is
// constructed at import time. This is the seam that lets the query layer run
// unchanged on web and React Native.
export function createGcSupabase({ url, anonKey, storage, auth } = {}) {
  return createClient(url, anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...auth,
    },
  })
}
