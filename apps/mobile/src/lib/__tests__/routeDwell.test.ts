import { describe, expect, it } from 'vitest'
import { createRouteDwellTracker, OVERLAY_ROUTE_KEY } from '../routeDwell'

// The clock is injected, so "90 seconds of foreground dwell" is exact arithmetic
// here rather than a timing test.

const VIEWER = 'viewer/[slug]'
const SONGS = '(tabs)/songs'

describe('createRouteDwellTracker', () => {
  it('does not emit for the first route of a session', () => {
    const t = createRouteDwellTracker()
    expect(t.onRoute(SONGS, '/songs', 0)).toBeNull()
  })

  it('emits foreground dwell for the route just left', () => {
    const t = createRouteDwellTracker()
    t.onRoute(SONGS, '/songs', 0)
    t.onRoute(VIEWER, '/viewer/a', 1_000)
    expect(t.onRoute(SONGS, '/songs', 95_000)).toEqual({
      routeKey: VIEWER,
      pathname: '/viewer/a',
      dwellMs: 94_000,
    })
  })

  it('excludes backgrounded time — a phone left open on a song earns nothing', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    t.onBackground(10_000) // 10s of real reading
    t.onForeground(3_600_000) // an hour face-down on a music stand
    const left = t.onRoute(SONGS, '/songs', 3_605_000) // then 5s more
    expect(left?.dwellMs).toBe(15_000)
  })

  it('counts a visit that is still backgrounded at departure as paused', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    t.onBackground(20_000)
    // A deep link can navigate while backgrounded; the paused clock must not
    // suddenly bank the whole background interval.
    expect(t.onRoute(SONGS, '/songs', 900_000)?.dwellMs).toBe(20_000)
  })

  it('treats a sheet as an overlay, not a departure, and resumes on close', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    // Export & share opens: presented through the shared formSheet route.
    expect(t.onRoute(OVERLAY_ROUTE_KEY, '/sheet', 30_000)).toBeNull()
    // Time inside the sheet does not count toward reading the chart.
    expect(t.onRoute(VIEWER, '/viewer/a', 50_000)).toBeNull()
    expect(t.onRoute(SONGS, '/songs', 110_000)?.dwellMs).toBe(90_000)
  })

  it('emits the frozen visit when a sheet dismisses into a different route', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    t.onRoute(OVERLAY_ROUTE_KEY, '/sheet', 95_000)
    const left = t.onRoute(SONGS, '/songs', 200_000)
    expect(left).toEqual({ routeKey: VIEWER, pathname: '/viewer/a', dwellMs: 95_000 })
  })

  it('does not resume a covered visit on foreground — only closing the sheet does', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    t.onRoute(OVERLAY_ROUTE_KEY, '/sheet', 10_000)
    t.onBackground(20_000)
    t.onForeground(30_000)
    // Still covered: the 30s→60s window must not accumulate.
    expect(t.onRoute(VIEWER, '/viewer/a', 60_000)).toBeNull()
    expect(t.onRoute(SONGS, '/songs', 70_000)?.dwellMs).toBe(20_000)
  })

  it('keys dwell on the resolved pathname, so song A → song B ends A', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    const left = t.onRoute(VIEWER, '/viewer/b', 50_000)
    expect(left).toEqual({ routeKey: VIEWER, pathname: '/viewer/a', dwellMs: 50_000 })
    // B starts fresh — two half-reads never pool into one qualifying visit.
    expect(t.peek(60_000)?.dwellMs).toBe(10_000)
  })

  it('ignores a re-report of the unchanged route', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 0)
    expect(t.onRoute(VIEWER, '/viewer/a', 10_000)).toBeNull()
    expect(t.peek(20_000)?.dwellMs).toBe(20_000)
  })

  it('never lets a backwards clock subtract from banked dwell', () => {
    const t = createRouteDwellTracker()
    t.onRoute(VIEWER, '/viewer/a', 100_000)
    // NTP correction / manual clock change mid-visit.
    expect(t.onRoute(SONGS, '/songs', 40_000)?.dwellMs).toBe(0)
  })
})
