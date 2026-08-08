import { isAbortError, isRequestTimeout } from './requestBudget'
import { markSessionError } from './sessionError'

// Supabase errors are plain objects ({ message, details, hint, code }), not Error
// instances — so `String(err)` yields "[object Object]". Extract a readable
// message across Error instances, Supabase error objects, and strings.
//
// This is a DIAGNOSTIC extractor, not a user-facing sanitiser. Do not render its
// output: it has leaked raw Postgres text to users before (`column
// user_starred_songs.created_at does not exist`), and with request deadlines in
// place it would now also surface `request_timeout_14000`. Log it, and show the
// caller's own localized copy instead — see reportFailure.
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

/**
 * Log a failed read or write, and report whether the UI should show an error.
 *
 * Returns false for a deliberate cancellation (a user-cancelled download, or any
 * caller-supplied abort), which must never be presented to the user as a
 * failure — that is the one abort case the app can produce that is not a
 * timeout. Returns true for a real failure, including one of our own deadlines,
 * which is logged as such so a timeout is distinguishable from a query error in
 * the console without being distinguishable in the UI (to the user, "no network"
 * and "too slow" are the same problem with the same fix).
 *
 * `scope` is the hook or screen name, e.g. 'useStarredSongs'.
 */
export function reportFailure(scope: string, err: unknown): boolean {
  if (isAbortError(err)) return false
  // Below the abort check on purpose: a user-cancelled download is not a bad
  // experience, and marking it would needlessly disqualify the session from an
  // in-app review request. See sessionError.ts.
  markSessionError(scope)
  console.error(`[${scope}] failed: ${describeReason(err)}`)
  return true
}

/** What to write in the log: our own deadline named as such, else the raw text. */
function describeReason(err: unknown): string {
  return isRequestTimeout(err) ? 'request timed out' : errMessage(err)
}

/**
 * An error whose message was WRITTEN FOR whoever is holding the device, and is
 * therefore safe to display verbatim. Everything else is diagnostic and gets
 * replaced with localized copy.
 *
 * Used sparingly — currently only for api.ts's misconfigured-base-URL hint,
 * which tells a developer or tester exactly what to fix and would be worthless
 * as "Something went wrong".
 */
export class UserFacingError extends Error {
  readonly name = 'UserFacingError'
}

function isUserFacingError(err: unknown): boolean {
  if (err instanceof UserFacingError) return true
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; message?: unknown }
  return e.name === 'UserFacingError' || errMessage(err).startsWith('UserFacingError:')
}

/**
 * React Native's fetch rejects with a bare `TypeError: Network request failed`
 * on a refused or unreachable host — no code, no cause, nothing but the string.
 * Matching on it is unlovely, but it is the difference between telling a user to
 * check their connection and telling them nothing useful, and it is the most
 * common real failure this app sees.
 */
function isNetworkFailure(err: unknown): boolean {
  const message = errMessage(err).toLowerCase()
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error')
  )
}

const OFFLINE_DETAIL_KEY = 'errors:load.hint'
const GENERIC_DETAIL_KEY = 'errors:tryAgain'

/**
 * Log a failure and return the i18n key for the DETAIL line beneath a
 * surface-specific heading — "check your connection" when we can tell the
 * network is the problem, a generic apology otherwise.
 *
 * For hooks that render their own heading (`errors:load.*`), use
 * reportFailure instead; this is for the second line.
 */
export function failureDetailKey(scope: string, err: unknown): string {
  const offline = isRequestTimeout(err) || isNetworkFailure(err)
  markSessionError(scope)
  console.error(`[${scope}] failed: ${describeReason(err)}`)
  return offline ? OFFLINE_DETAIL_KEY : GENERIC_DETAIL_KEY
}

/**
 * Body text for an Alert after a failed ACTION (a save, delete, export, send).
 *
 * These alerts used to pass errMessage(err) straight through, which showed users
 * raw Postgres text — and, once requests gained deadlines, would have shown them
 * "RequestTimeoutError: The request timed out." The localized title above the
 * body already says what failed; this says what to do about it.
 *
 * `t` is injected so this module stays i18n-free and unit-testable headless.
 */
export function actionFailureMessage(
  scope: string,
  err: unknown,
  t: (key: string) => string,
): string {
  if (isUserFacingError(err)) {
    // This branch returns before failureDetailKey can mark the session, so it
    // marks its own — a misconfigured API base URL is still a failed action in
    // front of whoever is holding the device.
    markSessionError(scope)
    console.error(`[${scope}] failed: ${errMessage(err)}`)
    return errMessage(err).replace(/^UserFacingError:\s*/, '')
  }
  return t(failureDetailKey(scope, err))
}

/**
 * Body text for a failed SAVE, where the user is mid-edit and the thing they need
 * to know is that their work is not persisted — not what went wrong. Separate
 * from actionFailureMessage because a debounced save retries itself, so there is
 * nothing for the user to tap.
 */
export function saveFailureKey(scope: string, err: unknown): string {
  markSessionError(scope)
  console.error(`[${scope}] save failed: ${describeReason(err)}`)
  return 'errors:saveFailed'
}
