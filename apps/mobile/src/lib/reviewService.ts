import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { usePathname, useSegments } from 'expo-router'
import * as StoreReview from 'expo-store-review'
import { getDefaultsSnapshot, type KVStorage } from './defaults'
import { hasSeenIntro } from './introSeen'
import { currentStreak, streakDateKey } from './readingStreak'
import { hasSessionError, sessionErrorScope } from './sessionError'
import { createRouteDwellTracker, OVERLAY_ROUTE_KEY, type DwellEvent } from './routeDwell'
import { evaluateReviewEligibility, triggerFor } from './reviewEligibility'
import { getReviewState, hydrateReviewState, recordAppOpen, recordReviewRequest } from './reviewState'

// Native wiring for the in-app review request. Keeps expo-store-review, AppState
// and expo-router isolated from the pure policy in reviewEligibility.ts and the
// pure clock in routeDwell.ts — the same split as readerReminder.ts /
// readerReminderService.ts and accessibilityFlags.ts /
// accessibilityFlagsService.ts.
//
// The feature has NO UI of its own. The OS sheet is the entire surface: no
// pre-prompt, no "Enjoying GraceChords?" gate, no stars we drew ourselves.

/**
 * How long to let the destination screen settle before asking.
 *
 * The push animation has to be finished — a system sheet sliding up through a
 * running transition looks broken — and this doubles as a grace period in which
 * a user who is only passing through can navigate again and cancel the request.
 */
const SETTLE_MS = 1200

/**
 * The EAS build profile, injected at build time (see eas.json). The ONLY thing
 * it can prove is that a binary did not come from the `development` or `preview`
 * profile; it cannot see which Play track served it, because `eas submit`
 * promotes one production AAB to internal testing and production alike.
 */
const BUILD_PROFILE = process.env.EXPO_PUBLIC_BUILD_PROFILE

const tracker = createRouteDwellTracker()

/** Snapshot of the intro flag as it stood when this launch began. */
let introSeenAtLaunch = false
/** Cached result of the platform availability check (null = not yet asked). */
let available: boolean | null = null
/** Pending settle timer, if a departure is waiting to be judged. */
let pending: ReturnType<typeof setTimeout> | null = null
/**
 * Bumped on every navigation. Captured before an await and re-checked after, so
 * a request can never land against a route the user has already left.
 */
let navGeneration = 0
let currentRouteKey = ''
/** One request per launch, whatever the gates say. */
let requestedThisSession = false

function log(message: string): void {
  // Dev-only by construction: this is a debugging aid, not telemetry, and there
  // is no analytics in this app by design.
  if (__DEV__) console.log(`[review] ${message}`)
}

/**
 * Whether the binary could plausibly be a real store install.
 *
 * iOS: expo-store-review's own isAvailableAsync is the strong signal and is
 * checked separately — its native implementation returns false when the app has
 * a sandbox receipt and no embedded provisioning profile, which is exactly the
 * TestFlight (and Xcode-install) case. So iOS needs nothing more here beyond
 * rejecting a mismatched build profile if one was injected.
 *
 * Android: THIS IS THE WEAK SPOT, and it is a platform limitation rather than an
 * implementation shortcut. isAvailableAsync only checks that the Play Store app
 * is installed, and Play internal/closed testing serves the SAME production AAB
 * from the SAME store — getInstallerPackageName is 'com.android.vending' either
 * way. Requiring the profile marker at least rules out dev clients and preview
 * APKs; it cannot rule out an internal tester on the production track, and
 * nothing available at runtime can.
 */
function isProductionProfile(): boolean {
  if (__DEV__) return false
  if (BUILD_PROFILE) return BUILD_PROFILE === 'production'
  // Unset: trust iOS's receipt check, but refuse to guess on Android.
  return Platform.OS === 'ios'
}

/** Ask the platform whether a review flow exists at all. Cached — it cannot change. */
async function storeReviewAvailable(): Promise<boolean> {
  if (available !== null) return available
  try {
    available = await StoreReview.isAvailableAsync()
  } catch {
    available = false
  }
  return available
}

function cancelPending(): void {
  if (pending === null) return
  clearTimeout(pending)
  pending = null
}

/**
 * Fire the request. Availability has already been confirmed by the caller, so
 * reaching here always spends an attempt.
 *
 * The bookkeeping is written BEFORE the native call is awaited, and is not
 * conditional on it resolving. Neither platform reports whether the sheet
 * actually rendered — iOS silently no-ops once its own ~3/year cap is spent —
 * so an attempt is spent and unverifiable the moment we ask. Recording
 * afterwards, or only on success, would let a user be asked repeatedly.
 */
async function requestReviewNow(): Promise<void> {
  requestedThisSession = true
  recordReviewRequest(Date.now())
  try {
    await StoreReview.requestReview()
  } catch {
    // Nothing to do and nothing to tell the user: the sheet is the platform's,
    // and a failure to present it is not their problem.
  }
}

/**
 * Judge a departure and, if it earns one, ask for a review.
 *
 * Called only after the destination has settled, and re-validated after every
 * await so a late-resolving availability check cannot fire the sheet into a
 * screen the user has since left.
 */
async function judgeDeparture(event: DwellEvent, generation: number): Promise<void> {
  const stillHere = () =>
    navGeneration === generation &&
    AppState.currentState === 'active' &&
    currentRouteKey !== OVERLAY_ROUTE_KEY

  if (!stillHere()) return

  const platformAvailable = await storeReviewAvailable()
  if (!stillHere()) return

  // In a dev build the production gate is SIMULATED as passing, so the rest of
  // the policy can be exercised end to end — the sheet does not render in
  // TestFlight and is unreliable in Play internal testing, which makes the log
  // the only way to verify any of this. The API is never called below in dev,
  // so nothing can leak from this.
  const isProductionBuild = __DEV__ ? true : isProductionProfile() && platformAvailable

  const decision = evaluateReviewEligibility({
    routeKey: event.routeKey,
    pathname: event.pathname,
    dwellMs: event.dwellMs,
    streak: currentStreak(),
    dailyWordDestination: getDefaultsSnapshot().dailyWordDestination,
    isProductionBuild,
    hasSessionError: hasSessionError(),
    introSeenAtLaunch,
    state: getReviewState(),
    now: Date.now(),
    today: streakDateKey(new Date()),
  })

  if (!decision.eligible) {
    // 'route' is ordinary navigation, not a near miss — logging every screen
    // change would bury the near misses that matter.
    if (decision.gate !== 'route') {
      const scope = decision.gate === 'sessionError' ? ` [first failure: ${sessionErrorScope()}]` : ''
      log(`blocked by ${decision.gate}: ${decision.reason}${scope}`)
    }
    return
  }

  if (__DEV__) {
    log(`${decision.reason} — dev build, API NOT called`)
    return
  }
  if (!platformAvailable) {
    // Cannot happen (isProductionBuild folds this in), but an attempt must never
    // be spent on a platform that has no review flow to show.
    return
  }
  await requestReviewNow()
}

function scheduleJudgement(event: DwellEvent): void {
  const generation = navGeneration
  pending = setTimeout(() => {
    pending = null
    void judgeDeparture(event, generation)
  }, SETTLE_MS)
}

/**
 * Stamp the launch and snapshot the intro flag. Call once, after the launch
 * stores have hydrated — recordAppOpen must not run against the default state or
 * it would overwrite the real first-launch date with today's.
 */
export async function startReviewSession(store: KVStorage): Promise<void> {
  // The intro gate needs "already seen BEFORE this launch". Reading hasSeenIntro
  // here — after hydration, before the intro screen can mark it — gives exactly
  // that, without the intro having to tell us anything.
  introSeenAtLaunch = hasSeenIntro()
  await hydrateReviewState(store)
  recordAppOpen()
  // Warm the availability cache so the request path has nothing to await.
  void storeReviewAvailable().then((ok) => log(`store review available: ${ok}`))
  const state = getReviewState()
  log(
    `session start (introSeenAtLaunch=${introSeenAtLaunch}, firstLaunch=${state.firstLaunchDate}, ` +
      `opens=${state.openDays}, priorRequests=${state.requestCount})`,
  )
}

/**
 * Watch navigation and app lifecycle, and ask for a review after a genuinely
 * positive departure. Mount ONCE, in the root layout.
 *
 * Reads navigation state only — the Song Viewer, Setlist Performer and Daily
 * Word reader know nothing about this and are not touched.
 */
export function useReviewObserver(): void {
  const segments = useSegments()
  const pathname = usePathname()
  // Depend on the joined STRING, not the array: useSegments returns a fresh
  // array identity on re-render, and an effect keyed on it would cancel the
  // settle timer on every incidental render of the root layout.
  const routeKey = segments.join('/')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const now = Date.now()
      if (state === 'active') {
        tracker.onForeground(now)
        return
      }
      tracker.onBackground(now)
      // A sheet must never be queued up to appear on a screen the user walked
      // away from, and iOS will not present one from the background anyway.
      cancelPending()
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    navGeneration += 1
    currentRouteKey = routeKey
    // Any navigation invalidates a queued judgement: the user moved on.
    cancelPending()

    const departed = tracker.onRoute(routeKey, pathname, Date.now())
    if (!departed || requestedThisSession) return
    scheduleJudgement(departed)
  }, [routeKey, pathname])
}
