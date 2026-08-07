// The app's ONE network timeout policy. Every timeout number the app uses lives
// here; no call site invents its own.
//
// Kept RN-free (no react-native / AsyncStorage imports) so it unit-tests headless
// under vitest, like authSession.ts. `fetch`, AbortController and setTimeout are
// the only globals it touches, and all three exist in node and in React Native.
//
// Why this exists: before it, exactly one network operation in the whole app was
// bounded (the boot session read). Everything else — every Supabase query, both
// api.ts fetches, every R2 chapter read, all 1189 downloader requests — ran on
// the platform default, up to ~60 s on iOS. A request that never settles is an
// infinite spinner, and an infinite spinner is indistinguishable from a hung app.

/**
 * Boot session read. Nothing is on screen — the native splash is still up, so
 * this is the only budget the user experiences as "the app has not launched".
 *
 * Unchanged from build 12; it lives here rather than in authSession.ts so the
 * whole budget reads in one place. See resolveInitialSession for why a race
 * (not a catch) and why a timeout degrades to signed out.
 */
export const GATE_MS = 2500

/**
 * A request the user is watching a spinner for.
 *
 * Derived from the slowest connection that must still SUCCEED, not from what
 * feels fast. On congested cellular with a cold socket: DNS 1 RTT + TCP 1 RTT +
 * TLS 1.3 1 RTT + request 1 RTT is ~4.8 s at a 1.2 s RTT, and moving a ~60 KB
 * chapter JSON at ~80 kbit/s adds ~6 s — call it 11 s for a request that would
 * have worked. +30% margin → 14 s. Still 4x faster than iOS's ~60 s default.
 *
 * Biasing this number down buys nothing the user can see (a spinner is a spinner
 * either way) and costs real failures on slow-but-working links. The value of a
 * bound here is that the screen is GUARANTEED to reach a terminal state, not
 * that it reaches it quickly.
 */
export const FOREGROUND_MS = 14000

/**
 * Speculative work the user never sees and never waits for.
 *
 * Shorter than FOREGROUND on purpose: abandoning it frees the socket and the
 * cellular radio for the request the user IS waiting on, and a prefetch that has
 * not landed by the time the user could plausibly reach the screen has no value
 * left to deliver. 7 s is the floor of "launch finished and the user tapped
 * through to Daily Word".
 */
export const BACKGROUND_MS = 7000

/**
 * Thrown when OUR deadline fired. Never thrown for a caller's own abort — see
 * withRequestBudget.
 *
 * Two details here are load-bearing and were both established by reading the
 * installed client source, not assumed:
 *
 * `code = 'ABORT_ERR'`. postgrest-js retries a failed fetch on idempotent
 * methods — RETRYABLE_METHODS is ['GET','HEAD','OPTIONS'], retry defaults to ON,
 * DEFAULT_MAX_RETRIES is 3, backoff 1s/2s/4s — and short-circuits that loop only
 * for `fetchError.name === 'AbortError' || fetchError.code === 'ABORT_ERR'`.
 * Every read this app makes is a GET, so a custom code would have had each
 * timeout retried three more times: 14+1+14+2+14+4+14 ≈ 63 s for one blackholed
 * read, WORSE than the ~60 s platform default this exists to fix. Presenting as
 * ABORT_ERR makes postgrest rethrow immediately, so one budget means one budget.
 *
 * A HUMAN-READABLE message, not a token. postgrest discards `code` for
 * client-side network errors (it deliberately reserves that field for PostgREST
 * and Postgres codes) and reshapes the failure as
 * `{ message: '<name>: <message>' }`, so the message is the only channel that
 * survives a Supabase query. Two screens still render that text directly —
 * app/viewer/[slug].tsx and SetlistBuilderScreen — so it has to read as a
 * sentence rather than as `request_timeout_14000`.
 */
export class RequestTimeoutError extends Error {
  readonly name = 'RequestTimeoutError'
  readonly code = 'ABORT_ERR'
  constructor(readonly budgetMs: number) {
    super('The request timed out.')
  }
}

/**
 * True when a failure was our deadline, whether or not the Error survived.
 *
 * The message check is not laziness: a timeout inside a Supabase query reaches
 * the caller as a plain object whose `name` is gone and whose `code` postgrest
 * has blanked, leaving `message` prefixed with the constructor name as the only
 * evidence. Direct fetch callers (R2, api.ts, the downloader) still get the real
 * instance and match on the first two checks.
 */
export function isRequestTimeout(err: unknown): boolean {
  if (err instanceof RequestTimeoutError) return true
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; message?: unknown }
  if (e.name === 'RequestTimeoutError') return true
  return typeof e.message === 'string' && e.message.startsWith('RequestTimeoutError:')
}

/**
 * True for a cancellation someone asked for deliberately (a user-cancelled
 * download, or a caller-supplied signal) rather than a failure. These must never
 * be shown to the user as an error.
 *
 * Note the app has no unmount-driven aborts by design: hooks use a cooperative
 * `alive` boolean instead, because bibleSource's getPassage shares one in-flight
 * promise between the launch prefetch and the reader — a component-owned
 * AbortController there would cancel a request another subscriber is still
 * waiting on. So in practice this only fires for the downloads cancel path.
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if (isRequestTimeout(err)) return false
  const e = err as { name?: unknown; message?: unknown }
  if (e.name === 'AbortError') return true
  // Same flattening caveat as isRequestTimeout: a Supabase query keeps only the
  // message, with the original error's name prefixed onto it.
  return typeof e.message === 'string' && e.message.startsWith('AbortError:')
}

/**
 * Deliberately the same shape as the global `fetch`, so the real one is
 * assignable with no cast and a wrapped one is assignable wherever a fetch is
 * expected — including core's narrower `FetchLike` (which takes a string URL and
 * reads only ok/status/json off the response).
 */
export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return String((input as Request).url ?? input)
}

/**
 * Wrap a fetch so every request gets a deadline. Returns a drop-in fetch.
 *
 * `budgetFor` receives the request URL and returns the budget in ms, or null to
 * leave that request on the platform default.
 *
 * A caller's own `signal` (a user cancel) is forwarded and still surfaces as a
 * plain AbortError. ONLY our timer produces a RequestTimeoutError, which is the
 * whole timeout-vs-cancellation distinction. It is tracked with a boolean rather
 * than AbortSignal.reason because React Native's AbortController does not
 * reliably carry a reason.
 */
export function withRequestBudget(
  fetchImpl: FetchFn,
  budgetFor: (url: string) => number | null,
): FetchFn {
  return async (input, init) => {
    const budgetMs = budgetFor(urlOf(input))
    if (budgetMs == null) return fetchImpl(input, init)

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, budgetMs)

    const callerSignal = init?.signal
    const relayAbort = () => controller.abort()
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort()
      else callerSignal.addEventListener('abort', relayAbort)
    }

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal })
    } catch (err) {
      if (timedOut) throw new RequestTimeoutError(budgetMs)
      throw err
    } finally {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', relayAbort)
    }
  }
}

/**
 * Stop WAITING on a promise after `ms`, without cancelling it — the same
 * race-not-catch shape as resolveInitialSession.
 *
 * For work whose result is optional and whose underlying requests are shared:
 * the launch-time Daily Word prefetch stops being awaited at BACKGROUND_MS, but
 * its in-flight chapter requests keep their own (longer) budget and still
 * populate the cache if they land, so a reader that joins one is not
 * shortchanged.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, onLapse: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onLapse), ms)
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}
