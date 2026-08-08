// Did anything fail during THIS run of the app?
//
// Exists for one consumer: the in-app review gate (reviewEligibility.ts). Asking
// someone to rate the app minutes after their export failed or their sign-in
// bounced is the single most expensive mistake this feature can make — the OS
// gives no callback, so every request is a spent, unverifiable attempt, and a
// spent attempt on an annoyed user is worse than no attempt at all.
//
// Deliberately IN-MEMORY ONLY. The flag dies with the process, so a relaunch
// starts clean: a failure means "not this session", not "never again". It is
// also one-way within a session — nothing clears it — because a later success
// does not undo the user's memory of the failure.
//
// RN-free and dependency-free so the modules that mark it (errors.ts, api.ts)
// stay unit-testable headless, exactly as they are today.

let errored = false
let firstScope: string | null = null

/**
 * Record that something visibly failed. `scope` is the same caller identifier
 * the error logs already use ('useSong', 'SetlistBuilder.export', …) and is kept
 * only for the dev-build review log, so a near-miss names what poisoned the
 * session.
 *
 * Idempotent: the FIRST failure wins, since that is the one that set the tone.
 * Callers must not pass deliberate cancellations — see reportFailure's
 * isAbortError check in errors.ts.
 */
export function markSessionError(scope: string): void {
  if (errored) return
  errored = true
  firstScope = scope
}

/** Whether any failure has been recorded this session. */
export function hasSessionError(): boolean {
  return errored
}

/** The scope of the first failure this session, for dev logging only. */
export function sessionErrorScope(): string | null {
  return firstScope
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetSessionErrorForTest(): void {
  errored = false
  firstScope = null
}
