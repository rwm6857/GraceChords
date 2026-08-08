import { describe, expect, it } from 'vitest'
import {
  DAILY_TAB_ROUTE,
  DWELL_THRESHOLD_MS,
  evaluateReviewEligibility,
  READER_ROUTE,
  SET_VIEWER_ROUTE,
  SONG_VIEWER_ROUTE,
  daysBetweenDayKeys,
  type EligibilityInput,
} from '../reviewEligibility'
import { DEFAULT_REVIEW_STATE } from '../reviewState'

// Mirrors the verification checklist for the feature. Every gate is asserted by
// NAME as well as by outcome, because the reason string is what the dev-build
// debug override prints — it is the only way to exercise this logic on a device,
// since the OS sheet does not render in TestFlight.

const DAY = 86_400_000
const NOW = Date.UTC(2026, 7, 7, 12, 0, 0)
const TODAY = '2026-08-07'

/** A departure that passes every gate. Each test spoils exactly one thing. */
function eligibleInput(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    routeKey: SONG_VIEWER_ROUTE,
    pathname: '/viewer/still-alive',
    dwellMs: 94_000,
    streak: 0,
    dailyWordDestination: 'landing',
    isProductionBuild: true,
    hasSessionError: false,
    introSeenAtLaunch: true,
    state: {
      ...DEFAULT_REVIEW_STATE,
      firstLaunchDate: '2026-07-27', // 11 days back
      openDays: 5,
      lastOpenDate: TODAY,
    },
    now: NOW,
    today: TODAY,
    ...over,
  }
}

describe('daysBetweenDayKeys', () => {
  it('counts whole days and ignores DST by working in UTC', () => {
    expect(daysBetweenDayKeys('2026-03-01', '2026-03-31')).toBe(30)
    expect(daysBetweenDayKeys('2026-08-07', '2026-08-07')).toBe(0)
  })

  it('returns null for a missing or malformed key', () => {
    expect(daysBetweenDayKeys(null, TODAY)).toBeNull()
    expect(daysBetweenDayKeys('garbage', TODAY)).toBeNull()
  })
})

describe('evaluateReviewEligibility — triggers', () => {
  it('is eligible after a long song-viewer read', () => {
    const d = evaluateReviewEligibility(eligibleInput())
    expect(d.eligible).toBe(true)
    expect(d.eligible && d.trigger).toBe('dwell')
    expect(d.reason).toContain('would request now')
    expect(d.reason).toContain('dwell=94s')
  })

  it('is eligible after a long set-viewer (Performer) session', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ routeKey: SET_VIEWER_ROUTE, pathname: '/perform/abc' }),
    )
    expect(d.eligible).toBe(true)
    expect(d.eligible && d.trigger).toBe('dwell')
  })

  it('names the dwell gate for a ~10s song-viewer visit', () => {
    const d = evaluateReviewEligibility(eligibleInput({ dwellMs: 10_000 }))
    expect(d.eligible).toBe(false)
    expect(!d.eligible && d.gate).toBe('dwell')
    expect(d.reason).toContain('dwell 10s < 90s')
  })

  it('rejects a visit that only reaches the threshold by counting background time', () => {
    // The tracker already excludes it; this asserts the boundary the policy sees.
    const d = evaluateReviewEligibility(eligibleInput({ dwellMs: DWELL_THRESHOLD_MS - 1 }))
    expect(!d.eligible && d.gate).toBe('dwell')
  })

  it('needs a streak of 4 to fire on the reader, not 3', () => {
    const three = evaluateReviewEligibility(
      eligibleInput({ routeKey: READER_ROUTE, pathname: '/daily/reader', dwellMs: 5_000, streak: 3 }),
    )
    expect(three.eligible).toBe(false)
    expect(!three.eligible && three.gate).toBe('streak')
    expect(three.reason).toContain('streak 3 < 4')

    const four = evaluateReviewEligibility(
      eligibleInput({ routeKey: READER_ROUTE, pathname: '/daily/reader', dwellMs: 5_000, streak: 4 }),
    )
    expect(four.eligible).toBe(true)
    expect(four.eligible && four.trigger).toBe('streak')
  })

  it('treats the Daily Word TAB as the reader only when the pref says so', () => {
    const asReader = evaluateReviewEligibility(
      eligibleInput({
        routeKey: DAILY_TAB_ROUTE,
        pathname: '/daily',
        dwellMs: 5_000,
        streak: 8,
        dailyWordDestination: 'reader',
      }),
    )
    expect(asReader.eligible).toBe(true)

    const asLanding = evaluateReviewEligibility(
      eligibleInput({
        routeKey: DAILY_TAB_ROUTE,
        pathname: '/daily',
        dwellMs: 5_000,
        streak: 8,
        dailyWordDestination: 'landing',
      }),
    )
    expect(!asLanding.eligible && asLanding.gate).toBe('route')
  })

  it('ignores non-qualifying routes quietly', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ routeKey: '(tabs)/songs', pathname: '/songs', dwellMs: 600_000 }),
    )
    expect(!d.eligible && d.gate).toBe('route')
  })

  it('never evaluates the overlay route', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ routeKey: 'sheet', pathname: '/sheet', dwellMs: 600_000 }),
    )
    expect(!d.eligible && d.gate).toBe('route')
  })

  it('does not let a setlist BUILDER visit qualify as a set viewer', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ routeKey: 'setlist/[id]', pathname: '/setlist/abc' }),
    )
    expect(!d.eligible && d.gate).toBe('route')
  })
})

describe('evaluateReviewEligibility — ambient gates', () => {
  it('blocks a non-production build', () => {
    const d = evaluateReviewEligibility(eligibleInput({ isProductionBuild: false }))
    expect(!d.eligible && d.gate).toBe('production')
  })

  it('blocks when anything failed this session', () => {
    const d = evaluateReviewEligibility(eligibleInput({ hasSessionError: true }))
    expect(!d.eligible && d.gate).toBe('sessionError')
    expect(d.reason).toContain('an error occurred this session')
  })

  it('blocks inside the first 7 days', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ state: { ...eligibleInput().state, firstLaunchDate: '2026-08-02' } }),
    )
    expect(!d.eligible && d.gate).toBe('firstLaunchAge')
  })

  it('allows exactly 7 days', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ state: { ...eligibleInput().state, firstLaunchDate: '2026-07-31' } }),
    )
    expect(d.eligible).toBe(true)
  })

  it('blocks a missing or malformed first-launch date rather than trusting it', () => {
    const missing = evaluateReviewEligibility(
      eligibleInput({ state: { ...eligibleInput().state, firstLaunchDate: null } }),
    )
    expect(!missing.eligible && missing.gate).toBe('firstLaunchAge')

    const bad = evaluateReviewEligibility(
      eligibleInput({ state: { ...eligibleInput().state, firstLaunchDate: 'not-a-date' } }),
    )
    expect(!bad.eligible && bad.gate).toBe('firstLaunchAge')
  })

  it('blocks under 3 distinct open days', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({ state: { ...eligibleInput().state, openDays: 2 } }),
    )
    expect(!d.eligible && d.gate).toBe('openDays')
  })

  it('blocks when the intro was not already seen before this launch', () => {
    const d = evaluateReviewEligibility(eligibleInput({ introSeenAtLaunch: false }))
    expect(!d.eligible && d.gate).toBe('intro')
  })

  it('blocks permanently after 3 lifetime requests', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({
        state: { ...eligibleInput().state, requestCount: 3, lastRequestAt: NOW - 900 * DAY },
      }),
    )
    expect(!d.eligible && d.gate).toBe('maxRequests')
  })

  it('blocks a request 10 days ago and allows one 130 days ago', () => {
    const recent = evaluateReviewEligibility(
      eligibleInput({
        state: { ...eligibleInput().state, requestCount: 1, lastRequestAt: NOW - 10 * DAY },
      }),
    )
    expect(!recent.eligible && recent.gate).toBe('recentRequest')
    expect(recent.reason).toContain('last request 10 days ago < 120')

    const old = evaluateReviewEligibility(
      eligibleInput({
        state: { ...eligibleInput().state, requestCount: 1, lastRequestAt: NOW - 130 * DAY },
      }),
    )
    expect(old.eligible).toBe(true)
  })

  it('reports the permanent cap before the temporary cooling-off', () => {
    const d = evaluateReviewEligibility(
      eligibleInput({
        state: { ...eligibleInput().state, requestCount: 3, lastRequestAt: NOW - 1 * DAY },
      }),
    )
    expect(!d.eligible && d.gate).toBe('maxRequests')
  })

  it('puts every input in the reason string, whatever the outcome', () => {
    const d = evaluateReviewEligibility(eligibleInput({ hasSessionError: true }))
    for (const fragment of [
      'trigger=dwell',
      'route=viewer/[slug]',
      'dwell=94s',
      'streak=0',
      'days=11',
      'opens=5',
      'priorRequests=0',
      'production=true',
    ]) {
      expect(d.reason).toContain(fragment)
    }
  })
})
