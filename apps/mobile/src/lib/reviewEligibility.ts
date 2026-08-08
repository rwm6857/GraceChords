import { OVERLAY_ROUTE_KEY } from './routeDwell'
import type { ReviewState } from './reviewState'

// The one place that decides whether to ask for an App Store / Play review.
//
// Everything the decision needs is passed in — no storage, no navigation, no
// native modules, no clock — so the whole policy is a pure function that
// unit-tests headless and can be reasoned about in one sitting. reviewService.ts
// gathers the inputs; this file owns the rules.
//
// WHY THE RULES ARE THIS STRICT. The OS gives no callback: we cannot tell
// whether the sheet rendered, whether the user rated, or whether the platform
// silently swallowed the call because its own cap (~3/year on iOS) was already
// spent. Every request is therefore an unverifiable, non-refundable attempt.
// The cost of asking at a bad moment is a 1-star rating; the cost of not asking
// is nothing at all. When those are the stakes, the gates should be boring.

/** Foreground seconds on a viewer that count as "they were really reading it". */
export const DWELL_THRESHOLD_MS = 90_000
/** Consecutive reading days that count as a habit rather than a visit. */
export const STREAK_THRESHOLD = 4
/** Nobody is asked to rate an app they installed this week. */
export const MIN_DAYS_SINCE_FIRST_LAUNCH = 7
/** Distinct calendar days opened — filters the install-once-never-return case. */
export const MIN_OPEN_DAYS = 3
/** Cooling-off between attempts. Comfortably wider than the iOS annual cap. */
export const MIN_DAYS_BETWEEN_REQUESTS = 120
/** Hard lifetime ceiling. Once spent, this install is never asked again. */
export const MAX_LIFETIME_REQUESTS = 3

// Route patterns, as useSegments() reports them (joined by '/'). Matching is on
// the PATTERN, so dynamic segments stay literal and no per-song logic exists.
/** app/viewer/[slug].tsx — the Song Viewer. */
export const SONG_VIEWER_ROUTE = 'viewer/[slug]'
/** app/perform/[id].tsx — the Performer, a.k.a. the Setlist Viewer. */
export const SET_VIEWER_ROUTE = 'perform/[id]'
/** app/daily/reader.tsx — the M'Cheyne reader pushed from the Daily Word landing. */
export const READER_ROUTE = 'daily/reader'
/**
 * app/(tabs)/daily.tsx — the Daily Word TAB, which renders the reader itself
 * (not the landing) when the device-local `dailyWordDestination` preference is
 * 'reader'. So this route qualifies for the streak trigger conditionally; see
 * triggerFor.
 */
export const DAILY_TAB_ROUTE = '(tabs)/daily'

export type ReviewTrigger = 'dwell' | 'streak'

export type EligibilityInput = {
  /** The route the user just LEFT (never the one they are on). */
  routeKey: string
  pathname: string
  /** Foreground-only dwell on that route, in milliseconds. */
  dwellMs: number
  /** currentStreak() — already 0 when disabled, absent, or stale. */
  streak: number
  /** getDefaultsSnapshot().dailyWordDestination — decides what the Daily Word tab was. */
  dailyWordDestination: 'landing' | 'reader'
  /**
   * A real store build, as strongly as the platform can tell us. On iOS this is
   * the sandbox-receipt check inside expo-store-review's isAvailableAsync (which
   * is false for TestFlight and Xcode installs); on Android it is the build
   * profile, which CANNOT see the Play testing track. See reviewService.ts.
   */
  isProductionBuild: boolean
  /** Anything visibly failed this run — see sessionError.ts. */
  hasSessionError: boolean
  /**
   * Whether the intro had ALREADY been seen when this launch started. False
   * covers both "never seen" and "seen during this very launch", which are the
   * same disqualifier: a first-run user has not formed an opinion yet.
   */
  introSeenAtLaunch: boolean
  state: ReviewState
  /** Epoch milliseconds. */
  now: number
  /** Today's local date key (YYYY-MM-DD). */
  today: string
}

export type EligibilityDecision =
  | { eligible: true; trigger: ReviewTrigger; reason: string }
  | { eligible: false; gate: EligibilityGate; reason: string }

export type EligibilityGate =
  | 'route'
  | 'dwell'
  | 'streak'
  | 'production'
  | 'sessionError'
  | 'firstLaunchAge'
  | 'openDays'
  | 'intro'
  | 'maxRequests'
  | 'recentRequest'

/** Whether a route is one whose dwell can ever earn a request. */
function isViewerRoute(routeKey: string): boolean {
  return routeKey === SONG_VIEWER_ROUTE || routeKey === SET_VIEWER_ROUTE
}

/** Whether a route was showing the M'Cheyne reader. */
function isReaderRoute(routeKey: string, destination: 'landing' | 'reader'): boolean {
  if (routeKey === READER_ROUTE) return true
  return routeKey === DAILY_TAB_ROUTE && destination === 'reader'
}

/** Parse a YYYY-MM-DD key to a UTC timestamp, so day arithmetic ignores DST. */
function parseDayKey(key: string | null): number | null {
  if (!key) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(ms) ? null : ms
}

/** Whole days from `fromKey` to `toKey`, or null if either is missing/malformed. */
export function daysBetweenDayKeys(fromKey: string | null, toKey: string | null): number | null {
  const from = parseDayKey(fromKey)
  const to = parseDayKey(toKey)
  if (from === null || to === null) return null
  return Math.floor((to - from) / 86_400_000)
}

/**
 * A single line naming every input the decision saw, appended to both the
 * "would request" log and every near-miss so the gate can be debugged from the
 * console alone — which is the only way to exercise it, since the sheet does not
 * render in TestFlight and is unreliable in Play internal testing.
 */
function describe(input: EligibilityInput, trigger: ReviewTrigger | null): string {
  const daysSinceFirst = daysBetweenDayKeys(input.state.firstLaunchDate, input.today)
  const daysSinceRequest =
    input.state.lastRequestAt === null
      ? null
      : Math.floor((input.now - input.state.lastRequestAt) / 86_400_000)
  return [
    `trigger=${trigger ?? 'none'}`,
    `route=${input.routeKey}`,
    `path=${input.pathname}`,
    `dwell=${Math.round(input.dwellMs / 1000)}s`,
    `streak=${input.streak}`,
    `days=${daysSinceFirst ?? 'n/a'}`,
    `opens=${input.state.openDays}`,
    `priorRequests=${input.state.requestCount}`,
    `sinceRequest=${daysSinceRequest === null ? 'never' : `${daysSinceRequest}d`}`,
    `production=${input.isProductionBuild}`,
  ].join(', ')
}

/**
 * Which positive signal (if any) this departure carries, ignoring every other
 * gate. Exported for the tests and for the dev log's near-miss reporting.
 */
export function triggerFor(input: EligibilityInput): ReviewTrigger | null {
  if (isViewerRoute(input.routeKey) && input.dwellMs >= DWELL_THRESHOLD_MS) return 'dwell'
  if (isReaderRoute(input.routeKey, input.dailyWordDestination) && input.streak >= STREAK_THRESHOLD) {
    return 'streak'
  }
  return null
}

/**
 * The whole policy. Returns a decision plus a human-readable reason — the reason
 * is the product here as much as the boolean, because the debug override in
 * reviewService.ts is the only way to verify any of this end to end.
 *
 * Gate order is chosen so the reported failure is the most useful one: the
 * trigger that ALMOST fired is named before the ambient gates, and the permanent
 * disqualifier (lifetime cap) is named before the temporary one (cooling-off).
 */
export function evaluateReviewEligibility(input: EligibilityInput): EligibilityDecision {
  const ctx = (trigger: ReviewTrigger | null) => describe(input, trigger)

  // The overlay route never ends a visit and must never be evaluated; if one
  // reaches here, something upstream is wrong. Fail closed rather than guess.
  if (input.routeKey === OVERLAY_ROUTE_KEY) {
    return { eligible: false, gate: 'route', reason: `overlay route (${ctx(null)})` }
  }

  const viewer = isViewerRoute(input.routeKey)
  const reader = isReaderRoute(input.routeKey, input.dailyWordDestination)
  if (!viewer && !reader) {
    // Ordinary navigation, not a near-miss. The caller does not log this.
    return { eligible: false, gate: 'route', reason: `not a qualifying route (${ctx(null)})` }
  }

  const trigger = triggerFor(input)
  if (!trigger) {
    return viewer
      ? {
          eligible: false,
          gate: 'dwell',
          reason: `dwell ${Math.round(input.dwellMs / 1000)}s < ${
            DWELL_THRESHOLD_MS / 1000
          }s (${ctx(null)})`,
        }
      : {
          eligible: false,
          gate: 'streak',
          reason: `streak ${input.streak} < ${STREAK_THRESHOLD} (${ctx(null)})`,
        }
  }

  const c = ctx(trigger)

  if (!input.isProductionBuild) {
    return { eligible: false, gate: 'production', reason: `not a production build (${c})` }
  }
  if (input.hasSessionError) {
    return { eligible: false, gate: 'sessionError', reason: `an error occurred this session (${c})` }
  }

  const daysSinceFirst = daysBetweenDayKeys(input.state.firstLaunchDate, input.today)
  // A null here means the first-launch date is missing or malformed, i.e. this
  // install has not been stamped yet — treat it as brand new, never as eligible.
  if (daysSinceFirst === null || daysSinceFirst < MIN_DAYS_SINCE_FIRST_LAUNCH) {
    return {
      eligible: false,
      gate: 'firstLaunchAge',
      reason: `${daysSinceFirst ?? 0} days since first launch < ${MIN_DAYS_SINCE_FIRST_LAUNCH} (${c})`,
    }
  }
  if (input.state.openDays < MIN_OPEN_DAYS) {
    return {
      eligible: false,
      gate: 'openDays',
      reason: `opened on ${input.state.openDays} distinct days < ${MIN_OPEN_DAYS} (${c})`,
    }
  }
  if (!input.introSeenAtLaunch) {
    return {
      eligible: false,
      gate: 'intro',
      reason: `intro not completed before this launch (${c})`,
    }
  }
  if (input.state.requestCount >= MAX_LIFETIME_REQUESTS) {
    return {
      eligible: false,
      gate: 'maxRequests',
      reason: `${input.state.requestCount} lifetime requests >= ${MAX_LIFETIME_REQUESTS} (${c})`,
    }
  }
  if (input.state.lastRequestAt !== null) {
    const days = Math.floor((input.now - input.state.lastRequestAt) / 86_400_000)
    if (days < MIN_DAYS_BETWEEN_REQUESTS) {
      return {
        eligible: false,
        gate: 'recentRequest',
        reason: `last request ${days} days ago < ${MIN_DAYS_BETWEEN_REQUESTS} (${c})`,
      }
    }
  }

  return { eligible: true, trigger, reason: `would request now (${c})` }
}
