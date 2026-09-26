// Boot-time session resolution, kept RN-free (no react-native / AsyncStorage
// imports) so it unit-tests headless under vitest — the supabase client is an
// injected dep, like authFlows.ts. Type-only supabase imports erase at compile
// time.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { GATE_MS, urlOf, type FetchFn } from './requestBudget'

type BootAuth = Pick<SupabaseClient['auth'], 'getSession' | 'signOut'>

/**
 * Reads the session supabase-js persisted, straight out of storage, without
 * touching the network. Injected rather than imported so this module stays
 * RN-free — see src/lib/storedSession.ts for the mobile implementation.
 */
export type StoredSessionReader = () => Promise<Session | null>

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

export type RefreshFailure = {
  status: number
  code: string | null
  message: string
  /** false only when GoTrue itself rejected the token, which ends the session. */
  keptSession: boolean
}

/**
 * Stop a refresh failure that isn't about the token from ending the session.
 *
 * auth-js deletes the persisted session on ANY refresh error it does not class
 * as retryable, and it only classes a thrown fetch or a 502/503/504/52x as
 * retryable (see @supabase/auth-js handleError / _callRefreshToken). So a
 * GoTrue 500, a 429 rate limit, or a non-JSON 4xx from something in the network
 * path (a captive portal, a content filter, a WAF page) signs the user out with a
 * perfectly good refresh token still on the server. Supabase refresh tokens do
 * not expire on their own, so a session should only ever end because the server
 * said so.
 *
 * Only a 4xx carrying a GoTrue error body (`code` / `error_code` / `error`) is
 * that: refresh_token_not_found, refresh_token_already_used, session_not_found,
 * user_banned and the like. Every other failed response is turned into a thrown
 * error, which auth-js treats exactly like being offline: the session is kept,
 * the auto-refresh tick retries it, and resolveInitialSession adopts it from disk
 * at launch.
 */
export function keepSessionOnTransientRefreshFailure(
  fetchImpl: FetchFn,
  onFailure?: (failure: RefreshFailure) => void,
): FetchFn {
  return async (input, init) => {
    const res = await fetchImpl(input, init)
    if (res.ok || !urlOf(input).includes('grant_type=refresh_token')) return res

    let body: Record<string, unknown> | null = null
    try {
      const parsed = await res.clone().json()
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
    } catch {
      // Not JSON, so not GoTrue.
    }
    const code = [body?.error_code, body?.code, body?.error].find(
      (v): v is string => typeof v === 'string',
    )
    const rawMessage = body?.msg ?? body?.message ?? body?.error_description
    const definitive = res.status >= 400 && res.status < 500 && res.status !== 429 && !!code
    const failure: RefreshFailure = {
      status: res.status,
      code: code ?? null,
      message: typeof rawMessage === 'string' ? rawMessage : `HTTP ${res.status}`,
      keptSession: !definitive,
    }
    onFailure?.(failure)
    if (definitive) return res
    throw new Error(`Token refresh failed (HTTP ${res.status}); keeping the session.`)
  }
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

/**
 * Fall back to the session on disk when the network could not confirm it.
 *
 * getSession() refreshes whenever the access token expires within auth-js's
 * 90 s margin, and an offline refresh makes it resolve { session: null, error }.
 * Read literally that is indistinguishable from "signed out", and the app acted
 * on it: the gate in app/_layout.tsx sent the user to /login with a perfectly
 * good session sitting in AsyncStorage. Any offline launch more than about an
 * hour after the last refresh logged the user out, which is the single most
 * common complaint this app has (and the worst one, because the user's own fix —
 * signing in again — also needs the network).
 *
 * So a session that cannot be VERIFIED is not the same as no session. If storage
 * still holds one with a refresh token, we adopt it and let the app render.
 * Nothing is weakened by this: authorization is decided server-side by RLS, every
 * query carries the same token it always did, and a revoked one fails exactly as
 * before. The cost is that an account revoked while the device is offline keeps
 * showing cached UI until the device next reaches the network — at which point
 * auth-js emits SIGNED_OUT and the gate takes over.
 */
async function readStoredSessionSafely(
  readStoredSession: StoredSessionReader | undefined,
): Promise<Session | null> {
  if (!readStoredSession) return null
  try {
    const stored = await readStoredSession()
    // A session with no refresh token can never be revived, so it is not worth
    // adopting — it would only put the user in an app where nothing loads.
    if (!stored?.refresh_token || !stored.user) return null
    return stored
  } catch {
    return null
  }
}

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
  readStoredSession?: StoredSessionReader,
): Promise<Session | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
  })
  try {
    const result = await Promise.race([
      readPersistedSession(auth, readStoredSession),
      deadline,
    ])
    // A timeout is the same situation as an offline refresh — we could not
    // confirm the session, which is not the same as not having one.
    if (result !== TIMED_OUT) return result
    return await readStoredSessionSafely(readStoredSession)
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
async function readPersistedSession(
  auth: BootAuth,
  readStoredSession?: StoredSessionReader,
): Promise<Session | null> {
  try {
    const { data, error } = await auth.getSession()
    // A DEAD token is the one case that really is "signed out": purge it and let
    // the gate route to /login. Checked first so the offline fallback below can
    // never resurrect a session the server has already rejected.
    if (error && isInvalidRefreshTokenError(error)) {
      await auth.signOut({ scope: 'local' }).catch(() => {})
      return null
    }
    if (data.session) return data.session
    // No session AND an error means the refresh could not complete — almost
    // always the network. Fall back to disk rather than reporting signed out.
    if (error) return await readStoredSessionSafely(readStoredSession)
    return null
  } catch {
    return await readStoredSessionSafely(readStoredSession)
  }
}
