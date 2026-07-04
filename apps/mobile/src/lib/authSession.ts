// Boot-time session resolution, kept RN-free (no react-native / AsyncStorage
// imports) so it unit-tests headless under vitest — the supabase client is an
// injected dep, like authFlows.ts. Type-only supabase imports erase at compile
// time.
import type { Session, SupabaseClient } from '@supabase/supabase-js'

type BootAuth = Pick<SupabaseClient['auth'], 'getSession' | 'signOut'>

// A persisted session whose refresh token has been revoked or rotated (signed
// out on another device, session deleted in the dashboard, token reuse) surfaces
// as an AuthApiError with this code / message on the next refresh. We treat it
// as "signed out" rather than a real failure.
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: string; message?: string }
  if (e.code === 'refresh_token_not_found') return true
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return msg.includes('refresh token') && (msg.includes('not found') || msg.includes('invalid'))
}

// Resolve the persisted session at launch. getSession() already refreshes an
// expired token internally and returns { session: null, error } when the stored
// refresh token is dead — but it leaves the caller to react. If we hit a dead
// token we purge the local session so (a) the app routes cleanly to /login and
// (b) the AppState auto-refresh tick has nothing to refresh, so it can never log
// the "Invalid Refresh Token: Refresh Token Not Found" error on launch. scope
// 'local' only clears the device — no network round-trip against a token the
// server has already forgotten.
export async function resolveInitialSession(auth: BootAuth): Promise<Session | null> {
  const { data, error } = await auth.getSession()
  if (error && isInvalidRefreshTokenError(error)) {
    await auth.signOut({ scope: 'local' }).catch(() => {})
    return null
  }
  return data.session ?? null
}
