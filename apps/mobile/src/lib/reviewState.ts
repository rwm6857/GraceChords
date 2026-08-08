import type { KVStorage } from './defaults'
import { streakDateKey } from './readingStreak'

// Device-local bookkeeping for the in-app review request.
//
// DELIBERATELY NOT ON THE SUPABASE PROFILE. Every value here describes this
// INSTALL, not this account: the OS enforces its review quota per device, so a
// user signing in on a second phone genuinely starts fresh, and syncing would
// mean a schema change for data the server has no use for. Same reasoning as
// gc.intro.seen.v1 (introSeen.ts).
//
// Follows the defaults.ts pattern — storage is INJECTED so the module is RN-free
// and unit-testable headless. Unlike the stores in the splash gate, hydration
// here does NOT block first paint: nothing on screen depends on it, and the
// review gate cannot fire until the user has navigated somewhere anyway.
//
// The key rides the existing single multiGet in launchStorage.ts rather than
// adding a fourteenth round trip.

export type ReviewState = {
  /** Local date key (YYYY-MM-DD) of the first launch we ever saw. */
  firstLaunchDate: string | null
  /**
   * How many DISTINCT calendar days the app has been opened on.
   *
   * A count plus lastOpenDate, never a list of days: this store must not grow
   * without bound over the years an install lives, and the gate only ever asks
   * "at least 3?".
   */
  openDays: number
  /** Local date key of the most recent open — guards openDays against double-counting. */
  lastOpenDate: string | null
  /** Epoch milliseconds of the last review request we made, or null. */
  lastRequestAt: number | null
  /** Lifetime count of review requests made from this install. */
  requestCount: number
}

export const DEFAULT_REVIEW_STATE: ReviewState = {
  firstLaunchDate: null,
  openDays: 0,
  lastOpenDate: null,
  lastRequestAt: null,
  requestCount: 0,
}

export const REVIEW_STORAGE_KEY = 'gc.review.v1'

let cache: ReviewState = DEFAULT_REVIEW_STATE
let storage: KVStorage | null = null

function persist() {
  storage?.setItem(REVIEW_STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

function isReviewState(v: unknown): v is ReviewState {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    (r.firstLaunchDate === null || typeof r.firstLaunchDate === 'string') &&
    typeof r.openDays === 'number' &&
    (r.lastOpenDate === null || typeof r.lastOpenDate === 'string') &&
    (r.lastRequestAt === null || typeof r.lastRequestAt === 'number') &&
    typeof r.requestCount === 'number'
  )
}

/**
 * Load the stored bookkeeping; a bad read falls back to the zeroed default.
 *
 * Falling back means "this install looks brand new", which RESTARTS the 7-day
 * and 3-distinct-days clocks rather than skipping them — the safe direction,
 * since the alternative would be treating a corrupt read as licence to prompt.
 * The one value that would be unsafe to lose is requestCount, and losing it
 * costs at most a re-earned attempt against a quota the OS enforces anyway.
 */
export async function hydrateReviewState(store: KVStorage): Promise<ReviewState> {
  storage = store
  try {
    const parsed = JSON.parse((await store.getItem(REVIEW_STORAGE_KEY)) ?? 'null') as unknown
    cache = isReviewState(parsed) ? parsed : DEFAULT_REVIEW_STATE
  } catch {
    cache = DEFAULT_REVIEW_STATE
  }
  return cache
}

/** Synchronous read (safe before hydrate — returns the zeroed default). */
export function getReviewState(): ReviewState {
  return cache
}

/**
 * Stamp this launch: seed the first-launch date if unset, and count today if it
 * is a day we have not counted before. Idempotent within a calendar day, so
 * calling it once per launch is correct even for a user who opens the app
 * fifteen times before lunch.
 */
export function recordAppOpen(today: Date = new Date()): void {
  const todayKey = streakDateKey(today)
  if (cache.firstLaunchDate && cache.lastOpenDate === todayKey) return
  cache = {
    ...cache,
    firstLaunchDate: cache.firstLaunchDate ?? todayKey,
    openDays: cache.lastOpenDate === todayKey ? cache.openDays : cache.openDays + 1,
    lastOpenDate: todayKey,
  }
  persist()
}

/**
 * Record that a review request was MADE — not that a sheet appeared, and not
 * that anyone rated anything.
 *
 * There is no success callback on either platform, and the OS silently declines
 * to render the sheet once its own quota is hit. An attempt is therefore spent
 * and unverifiable the moment we ask, so this must be called BEFORE (or at
 * least independently of) the request resolving. See requestReviewNow in
 * reviewService.ts.
 */
export function recordReviewRequest(at: number = Date.now()): void {
  cache = { ...cache, lastRequestAt: at, requestCount: cache.requestCount + 1 }
  persist()
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetReviewStateForTest(): void {
  cache = DEFAULT_REVIEW_STATE
  storage = null
}
