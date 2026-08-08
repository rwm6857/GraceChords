// How long the user actually spent on the route they just left.
//
// Feeds the in-app review gate (reviewEligibility.ts), which treats "read a song
// chart for a minute and a half, then navigated away" as a positive signal. The
// whole value of that signal rests on the number being honest, so this module is
// deliberately fussy about three things:
//
//  1. BACKGROUNDED TIME DOES NOT COUNT. A phone left face-up on a music stand
//     accumulates nothing. Dwell is a sum of foreground segments, not
//     (leaveTime - enterTime).
//  2. SHEETS ARE NOT A DEPARTURE. Every sheet in the app presents through the
//     shared `formSheet` route (app/sheet.tsx via src/lib/formSheetHost.ts), so
//     opening "Export & share" from the Song Viewer is a real router navigation
//     to `sheet`. Naively that reads as "left the viewer after 20s". The overlay
//     route instead FREEZES the current route's clock and emits nothing;
//     returning to the same pathname resumes it.
//  3. NOTHING IS PERSISTED. Dwell is per-session, in memory, and dies with the
//     process.
//
// Routes are identified two ways, and the distinction is load-bearing:
//   - `routeKey` is the useSegments() pattern joined by '/' ('viewer/[slug]'),
//     which is what qualification matches on — every song is the same key.
//   - `pathname` is the usePathname() resolved path ('/viewer/still-alive'),
//     which is what the clock is keyed on — so song A → song B ends A's dwell
//     rather than silently pooling two half-reads into one qualifying visit.
//     This is the conservative reading of "left the viewer after 90+ seconds".
//
// Pure and RN-free (the clock is passed in, never read) so it unit-tests
// headless, matching readingStreak.ts / readerReminder.ts.

/** The shared native-sheet route. Treated as an overlay, never as a departure. */
export const OVERLAY_ROUTE_KEY = 'sheet'

export type DwellEvent = {
  /** useSegments() pattern, joined by '/' — e.g. 'viewer/[slug]'. */
  routeKey: string
  /** usePathname() resolved path — e.g. '/viewer/still-alive'. */
  pathname: string
  /** Foreground-only time spent on that route, in milliseconds. */
  dwellMs: number
}

type Visit = {
  routeKey: string
  pathname: string
  /** Foreground milliseconds banked from completed segments. */
  bankedMs: number
  /** Start of the currently-running segment, or null while paused. */
  segmentStart: number | null
  /** True while an overlay route (a sheet) is covering this visit. */
  covered: boolean
}

export type RouteDwellTracker = {
  /**
   * Report the currently focused route. Returns the departure event for the
   * PREVIOUS route when this navigation ends a visit, or null when it does not
   * (first route of the session, entering or leaving an overlay, or a no-op
   * re-report of the same path).
   */
  onRoute(routeKey: string, pathname: string, now: number): DwellEvent | null
  /** App went to background/inactive — stop the clock. */
  onBackground(now: number): void
  /** App came back to foreground — restart the clock if a visit is live. */
  onForeground(now: number): void
  /** Current visit's dwell so far, for assertions and dev logging. */
  peek(now: number): DwellEvent | null
}

function bank(visit: Visit, now: number): void {
  if (visit.segmentStart === null) return
  // Guard against a non-monotonic clock (NTP correction, manual time change):
  // a negative delta must never subtract from banked dwell.
  visit.bankedMs += Math.max(0, now - visit.segmentStart)
  visit.segmentStart = null
}

function toEvent(visit: Visit, now: number): DwellEvent {
  const running = visit.segmentStart === null ? 0 : Math.max(0, now - visit.segmentStart)
  return {
    routeKey: visit.routeKey,
    pathname: visit.pathname,
    dwellMs: visit.bankedMs + running,
  }
}

/**
 * Create an independent tracker. The app uses a single module-level instance
 * (see reviewService.ts); tests get their own so state cannot leak between them.
 *
 * `foreground` starts true: the tracker is created while the app is running, and
 * AppState only reports CHANGES, so assuming background would strand the clock
 * until the user backgrounded and returned.
 */
export function createRouteDwellTracker(): RouteDwellTracker {
  let visit: Visit | null = null
  let foreground = true

  return {
    onRoute(routeKey, pathname, now) {
      if (routeKey === OVERLAY_ROUTE_KEY) {
        // A sheet opened over the current route. Freeze its clock and stay put —
        // the user has not left, and a sheet is also the one moment we must
        // never fire a review request, which "no event" handles for free.
        if (visit && !visit.covered) {
          bank(visit, now)
          visit.covered = true
        }
        return null
      }

      if (!visit) {
        visit = {
          routeKey,
          pathname,
          bankedMs: 0,
          segmentStart: foreground ? now : null,
          covered: false,
        }
        return null
      }

      if (visit.pathname === pathname) {
        // Either the sheet closed back onto the route that opened it, or the
        // router re-reported an unchanged route. Resume; never emit.
        if (visit.covered) {
          visit.covered = false
          visit.segmentStart = foreground ? now : null
        }
        return null
      }

      // A genuine departure — including "sheet dismissed straight into a
      // different route", where the visit being left is the frozen one.
      const departed = toEvent(visit, now)
      visit = {
        routeKey,
        pathname,
        bankedMs: 0,
        segmentStart: foreground ? now : null,
        covered: false,
      }
      return departed
    },

    onBackground(now) {
      foreground = false
      if (visit) bank(visit, now)
    },

    onForeground(now) {
      foreground = true
      // A covered visit stays paused: the sheet is still up, and it is the
      // overlay's own close that resumes it.
      if (visit && !visit.covered && visit.segmentStart === null) {
        visit.segmentStart = now
      }
    },

    peek(now) {
      return visit ? toEvent(visit, now) : null
    },
  }
}
