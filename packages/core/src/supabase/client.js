import { createClient } from '@supabase/supabase-js'

// Platform-agnostic Supabase factory. Callers inject the env values and a
// storage adapter (web: cookieStorage; mobile: AsyncStorage/SecureStore), so
// core never touches import.meta.env or browser globals — and nothing is
// constructed at import time. This is the seam that lets the query layer run
// unchanged on web and React Native.
// `global` is passed straight through to createClient when supplied, which is how
// a platform injects its own fetch. supabase-js hands global.fetch to GoTrue,
// PostgREST, storage and functions alike, so one wrapper bounds every request the
// client makes — see apps/mobile/src/lib/supabase.ts, which uses it to put a
// timeout on requests that would otherwise run to the ~60 s platform default.
// Omitted (as the web does) it is not forwarded at all, so nothing changes.
export function createGcSupabase({ url, anonKey, storage, auth, global } = {}) {
  return createClient(url, anonKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...auth,
    },
    ...(global ? { global } : {}),
  })
}
