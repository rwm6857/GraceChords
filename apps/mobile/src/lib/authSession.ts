// Boot-time session resolution, kept RN-free (no react-native / AsyncStorage
// imports) so it unit-tests headless under vitest — the supabase client is an
// injected dep, like authFlows.ts. Type-only supabase imports erase at compile
// time.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { GATE_MS } from './requestBudget'

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

// GoTrue's automatic init runs `_recoverAndRefresh` the moment the client is
// constructed (synchronously, at module import) and, when the persisted refresh
// token is dead, refreshes it and logs the AuthApiError straight to
// `console.error` itself — see @supabase/auth-js GoTrueClient `_recoverAndRefresh`.
// That fires BEFORE resolveInitialSession() (or the AppState auto-refresh tick)
// can react, so purging the token after the fact can't prevent the log. The log
// is benign: GoTrue removes the dead session immediately and the app routes to
// /login. But on a dev build it surfaces as a red LogBox screen ("Console
// Error: Invalid Refresh Token: Refresh Token Not Found") and in production it
// pollutes crash/log reporters with a non-actionable error. There is no config
// or API hook to silence that one call, so wrap `console.error` once and drop
// exactly this self-healing error (everything else passes through untouched).
//
// Idempotent per target (marks the wrapper so a second call is a no-op) and
// returns a restore function. `target` is injectable so it unit-tests without
// mutating the real global console.
const REFRESH_LOG_SILENCED = '__gcRefreshTokenLogSilenced'

type ConsoleErrorTarget = { error: (...args: unknown[]) => void }

export function silenceInvalidRefreshTokenLogs(
  target: ConsoleErrorTarget = console,
): () => void {
  const original = target.error
  if ((original as { [REFRESH_LOG_SILENCED]?: boolean })[REFRESH_LOG_SILENCED]) {
    return () => {}
  }
  const patched = (...args: unknown[]) => {
    if (args.some(isInvalidRefreshTokenError)) return
    original.apply(target, args)
  }
  ;(patched as { [REFRESH_LOG_SILENCED]?: boolean })[REFRESH_LOG_SILENCED] = true
  target.error = patched as ConsoleErrorTarget['error']
  return () => {
    // Only restore if nothing else re-wrapped console.error after us.
    if (target.error === patched) target.error = original
  }
}

// Cap on the boot session read. getSession() refreshes over the network whenever
// the access token expires within auth-js's EXPIRY_MARGIN_MS (90 s), so with a 1 h
// token TTL any cold launch more than ~59 min after the last refresh makes a round
// trip here — inside the native-splash hold, with no timeout of its own. On a
// hanging (rather than refusing) network that request does not fail fast: it waits
// out iOS's URLSession timeout, up to 60 s, which presents as "the app does not
// launch". 2.5 s is well above a healthy refresh (~0.2–0.6 s) and well below
// anything a user reads as a failure to launch.
//
// The value now comes from requestBudget.ts (as GATE_MS) so the app's whole
// timeout budget reads in one place. Same number, same semantics as build 12.
export const INITIAL_SESSION_TIMEOUT_MS = GATE_MS

const TIMED_OUT = Symbol('gc.initialSessionTimeout')

// Resolve the persisted session at launch, within a bounded time.
//
// A race, not a catch: getSession() RESOLVES with { session: null, error } on a
// network failure, so a rejection handler would never run — and a hanging socket
// never settles at all, so there is nothing to catch.
//
// On timeout we degrade to signed out. That is not a new state: an offline cold
// launch with a stale access token already resolves null today (the refresh fails,
// the error is not a dead-token error, and data.session is null). The in-flight
// getSession() is NOT cancelled — when it finally settles, auth-js emits
// TOKEN_REFRESHED on success or SIGNED_OUT after the local purge below, and the
// onAuthStateChange subscription in app/_layout.tsx adopts the corrected state. So
// a slow-but-working network self-heals into the app rather than sticking on /login.
export async function resolveInitialSession(
  auth: BootAuth,
  timeoutMs: number = INITIAL_SESSION_TIMEOUT_MS,
): Promise<Session | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
  })
  try {
    const result = await Promise.race([readPersistedSession(auth), deadline])
    return result === TIMED_OUT ? null : result
  } finally {
    clearTimeout(timer)
  }
}

// getSession() already refreshes an expired token internally and returns
// { session: null, error } when the stored refresh token is dead — but it leaves the
// caller to react. If we hit a dead token we purge the local session so (a) the app
// routes cleanly to /login and (b) the AppState auto-refresh tick has nothing to
// refresh, so it can never log the "Invalid Refresh Token: Refresh Token Not Found"
// error on launch. scope 'local' only clears the device — no network round-trip
// against a token the server has already forgotten.
//
// Wrapped so a throw (lock acquisition, storage adapter) resolves null rather than
// rejecting: this promise is a member of the hydration Promise.all that gates the
// splash, and a rejection there would leave `ready` false forever.
async function readPersistedSession(auth: BootAuth): Promise<Session | null> {
  try {
    const { data, error } = await auth.getSession()
    if (error && isInvalidRefreshTokenError(error)) {
      await auth.signOut({ scope: 'local' }).catch(() => {})
      return null
    }
    return data.session ?? null
  } catch {
    return null
  }
}
