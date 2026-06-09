import { createClient } from '@supabase/supabase-js'
import { cookieStorage } from './cookieStorage'

// Persist the auth session in a cookie scoped to `.gracechords.com` so the login
// is shared across gracechords.com and tracks.gracechords.com (single sign-on).
// storageKey is left at the supabase default — derived from the shared project
// ref — so both apps read the same cookie.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: cookieStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)
