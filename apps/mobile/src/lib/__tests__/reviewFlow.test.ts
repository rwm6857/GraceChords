import { beforeEach, describe, expect, it } from 'vitest'
import { createRouteDwellTracker, OVERLAY_ROUTE_KEY, type DwellEvent } from '../routeDwell'
import {
  READER_ROUTE,
  SONG_VIEWER_ROUTE,
  evaluateReviewEligibility,
  type EligibilityDecision,
} from '../reviewEligibility'
import {
  __resetReviewStateForTest,
  getReviewState,
  hydrateReviewState,
  recordAppOpen,
  recordReviewRequest,
} from '../reviewState'
import { __resetSessionErrorForTest, hasSessionError, markSessionError } from '../sessionError'

// End-to-end over the seam the unit tests can't reach on their own: navigation
// → dwell accounting → eligibility. This is the same composition reviewService.ts
// performs, with the native half (expo-store-review, AppState, expo-router)
// replaced by the driver below — so every scenario on the verification checklist
// is asserted here rather than only through the on-device console.

const SONGS = '(tabs)/songs'
const DAY = 86_400_000
const TODAY = '2026-08-07'
const NOW = Date.UTC(2026, 7, 7, 12)

/**
 * Drives the tracker exactly as the observer's navigation effect does, judging
 * departures with the real policy. Returns every decision the service WOULD have
 * evaluated — crucially, only on departure, never while a route is still open.
 */
function makeApp(opts: { introSeenAtLaunch?: boolean; production?: boolean } = {}) {
  const tracker = createRouteDwellTracker()
  const decisions: Array<{ event: DwellEvent; decision: EligibilityDecision }> = []
  let streak = 0
  let dailyWordDestination: 'landing' | 'reader' = 'landing'

  return {
    decisions,
    setStreak(v: number) {
      streak = v
    },
    setDailyWordDestination(v: 'landing' | 'reader') {
      dailyWordDestination = v
    },
    background(at: number) {
      tracker.onBackground(at)
    },
    foreground(at: number) {
      tracker.onForeground(at)
    },
    navigate(routeKey: string, pathname: string, at: number) {
      const departed = tracker.onRoute(routeKey, pathname, at)
      if (!departed) return
      decisions.push({
        event: departed,
        decision: evaluateReviewEligibility({
          routeKey: departed.routeKey,
          pathname: departed.pathname,
          dwellMs: departed.dwellMs,
          streak,
          dailyWordDestination,
          isProductionBuild: opts.production ?? true,
          hasSessionError: hasSessionError(),
          introSeenAtLaunch: opts.introSeenAtLaunch ?? true,
          state: getReviewState(),
          now: NOW + at,
          today: TODAY,
        }),
      })
    },
    last() {
      return decisions[decisions.length - 1]
    },
  }
}

/** A well-established install: first launch 11 days ago, opened on 5 days. */
async function seedEstablishedInstall(over: Record<string, unknown> = {}) {
  const data = new Map<string, string>([
    [
      'gc.review.v1',
      JSON.stringify({
        firstLaunchDate: '2026-07-27',
        openDays: 4,
        lastOpenDate: '2026-08-06',
        lastRequestAt: null,
        requestCount: 0,
        ...over,
      }),
    ],
  ])
  await hydrateReviewState({
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v)
    },
    removeItem: async (k) => {
      data.delete(k)
    },
  })
  recordAppOpen(new Date(2026, 7, 7)) // → openDays 5
  return data
}

beforeEach(() => {
  __resetReviewStateForTest()
  __resetSessionErrorForTest()
})

describe('review flow — dwell trigger', () => {
  it('song viewer, ~10s dwell, then back out: NOT eligible, names the dwell gate', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.navigate(SONGS, '/songs', 0)
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 1_000)
    app.navigate(SONGS, '/songs', 11_000)

    const { decision } = app.last()
    expect(decision.eligible).toBe(false)
    expect(!decision.eligible && decision.gate).toBe('dwell')
  })

  it('song viewer, 90+s dwell, then back out: eligible, logged with the dwell trigger', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.navigate(SONGS, '/songs', 0)
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 1_000)
    app.navigate(SONGS, '/songs', 95_000)

    const { decision } = app.last()
    expect(decision.eligible).toBe(true)
    expect(decision.eligible && decision.trigger).toBe('dwell')
    expect(decision.reason).toMatch(/would request now .*trigger=dwell.*dwell=94s/)
  })

  it('90+s of which most was backgrounded: NOT eligible', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.background(20_000)
    app.foreground(600_000) // ten minutes on the lock screen
    app.navigate(SONGS, '/songs', 610_000)

    const { event, decision } = app.last()
    expect(event.dwellMs).toBe(30_000)
    expect(!decision.eligible && decision.gate).toBe('dwell')
  })

  it('eligibility is never evaluated while still on the qualifying route', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    // Long past the threshold, still reading, sheet opened and closed.
    app.navigate(OVERLAY_ROUTE_KEY, '/sheet', 100_000)
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 120_000)
    expect(app.decisions).toHaveLength(0)

    app.navigate(SONGS, '/songs', 130_000)
    expect(app.decisions).toHaveLength(1)
    expect(app.last().decision.eligible).toBe(true)
  })

  it('opening the export sheet does not end the read, and time in it does not count', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.navigate(OVERLAY_ROUTE_KEY, '/sheet', 60_000)
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 300_000) // four minutes in the sheet
    app.navigate(SONGS, '/songs', 320_000)

    const { event, decision } = app.last()
    expect(event.dwellMs).toBe(80_000)
    expect(!decision.eligible && decision.gate).toBe('dwell')
  })
})

describe('review flow — streak trigger', () => {
  it('reader exit with a streak of 3: NOT eligible; 4+: eligible', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.setStreak(3)
    app.navigate(READER_ROUTE, '/daily/reader', 0)
    app.navigate(SONGS, '/songs', 5_000)
    const three = app.last().decision
    expect(!three.eligible && three.gate).toBe('streak')

    app.setStreak(4)
    app.navigate(READER_ROUTE, '/daily/reader', 6_000)
    app.navigate(SONGS, '/songs', 11_000)
    const four = app.last().decision
    expect(four.eligible).toBe(true)
    expect(four.eligible && four.trigger).toBe('streak')
  })
})

describe('review flow — session error', () => {
  it('an export failure disqualifies the rest of the session, and relaunch clears it', async () => {
    await seedEstablishedInstall()
    const app = makeApp()

    // A Cloudflare Pages Function export failure, as api.ts's apiError marks it.
    markSessionError('api 500')

    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.navigate(SONGS, '/songs', 95_000)
    const blocked = app.last().decision
    expect(blocked.eligible).toBe(false)
    expect(!blocked.eligible && blocked.gate).toBe('sessionError')
    expect(blocked.reason).toContain('an error occurred this session')

    // Relaunch: the flag is in memory only, so a new process starts clean.
    __resetSessionErrorForTest()
    const relaunched = makeApp()
    relaunched.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    relaunched.navigate(SONGS, '/songs', 95_000)
    expect(relaunched.last().decision.eligible).toBe(true)
  })
})

describe('review flow — launch and history gates', () => {
  it('same launch as the intro: NOT eligible', async () => {
    await seedEstablishedInstall()
    const app = makeApp({ introSeenAtLaunch: false })
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.navigate(SONGS, '/songs', 95_000)
    const d = app.last().decision
    expect(!d.eligible && d.gate).toBe('intro')
  })

  it('a prior request 10 days ago blocks; 130 days ago allows', async () => {
    await seedEstablishedInstall({ lastRequestAt: NOW - 10 * DAY, requestCount: 1 })
    const recent = makeApp()
    recent.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    recent.navigate(SONGS, '/songs', 95_000)
    const recentDecision = recent.last().decision
    expect(!recentDecision.eligible && recentDecision.gate).toBe('recentRequest')

    __resetReviewStateForTest()
    await seedEstablishedInstall({ lastRequestAt: NOW - 130 * DAY, requestCount: 1 })
    const old = makeApp()
    old.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    old.navigate(SONGS, '/songs', 95_000)
    expect(old.last().decision.eligible).toBe(true)
  })

  it('3 lifetime requests blocks permanently, however long ago they were', async () => {
    await seedEstablishedInstall({ lastRequestAt: NOW - 900 * DAY, requestCount: 3 })
    const app = makeApp()
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.navigate(SONGS, '/songs', 95_000)
    const d = app.last().decision
    expect(!d.eligible && d.gate).toBe('maxRequests')
  })

  it('a non-production build blocks', async () => {
    await seedEstablishedInstall()
    const app = makeApp({ production: false })
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.navigate(SONGS, '/songs', 95_000)
    const d = app.last().decision
    expect(!d.eligible && d.gate).toBe('production')
  })
})

describe('review flow — the request records itself', () => {
  it('a made request immediately blocks the next one, with no success callback', async () => {
    await seedEstablishedInstall()
    const app = makeApp()
    app.navigate(SONG_VIEWER_ROUTE, '/viewer/a', 0)
    app.navigate(SONGS, '/songs', 95_000)
    expect(app.last().decision.eligible).toBe(true)

    // What requestReviewNow does BEFORE awaiting the native call — nothing
    // confirms the sheet appeared, so the attempt is banked regardless.
    recordReviewRequest(NOW + 95_000)
    expect(getReviewState()).toMatchObject({ requestCount: 1, lastRequestAt: NOW + 95_000 })

    app.navigate(SONG_VIEWER_ROUTE, '/viewer/b', 96_000)
    app.navigate(SONGS, '/songs', 200_000)
    const next = app.last().decision
    expect(!next.eligible && next.gate).toBe('recentRequest')
  })
})
