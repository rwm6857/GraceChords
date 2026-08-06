import { isAbortError, isRequestTimeout } from './requestBudget'

// Supabase errors are plain objects ({ message, details, hint, code }), not Error
// instances — so `String(err)` yields "[object Object]". Extract a readable
// message across Error instances, Supabase error objects, and strings.
//
// This is a DIAGNOSTIC extractor, not a user-facing sanitiser. Do not render its
// output: it has leaked raw Postgres text to users before (`column
// user_starred_songs.created_at does not exist`), and with request deadlines in
// place it would now also surface `request_timeout_14000`. Log it, and show the
// caller's own localized copy instead — see reportLoadFailure.
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

/**
 * Log a failed read, and report whether the UI should show an error for it.
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
export function reportLoadFailure(scope: string, err: unknown): boolean {
  if (isAbortError(err)) return false
  const reason = isRequestTimeout(err) ? 'request timed out' : errMessage(err)
  console.error(`[${scope}] load failed: ${reason}`)
  return true
}
