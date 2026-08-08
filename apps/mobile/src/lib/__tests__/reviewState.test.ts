import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_REVIEW_STATE,
  REVIEW_STORAGE_KEY,
  __resetReviewStateForTest,
  getReviewState,
  hydrateReviewState,
  recordAppOpen,
  recordReviewRequest,
} from '../reviewState'

// Storage is injected (defaults.ts pattern), so this runs headless.

function makeStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    data,
    store: {
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        data.set(k, v)
      },
      removeItem: async (k: string) => {
        data.delete(k)
      },
    },
  }
}

beforeEach(__resetReviewStateForTest)

describe('hydrateReviewState', () => {
  it('falls back to the zeroed default when unset', async () => {
    const { store } = makeStore()
    expect(await hydrateReviewState(store)).toEqual(DEFAULT_REVIEW_STATE)
  })

  it('falls back to the default on malformed JSON', async () => {
    const { store } = makeStore({ [REVIEW_STORAGE_KEY]: '{{{' })
    expect(await hydrateReviewState(store)).toEqual(DEFAULT_REVIEW_STATE)
  })

  it('falls back to the default on a wrong-shaped payload', async () => {
    const { store } = makeStore({ [REVIEW_STORAGE_KEY]: '{"openDays":"lots"}' })
    expect(await hydrateReviewState(store)).toEqual(DEFAULT_REVIEW_STATE)
  })

  it('falls back to the default when the read throws', async () => {
    const store = {
      getItem: async () => {
        throw new Error('nope')
      },
      setItem: async () => {},
      removeItem: async () => {},
    }
    expect(await hydrateReviewState(store)).toEqual(DEFAULT_REVIEW_STATE)
  })

  it('restores a stored state verbatim', async () => {
    const stored = {
      firstLaunchDate: '2026-01-01',
      openDays: 9,
      lastOpenDate: '2026-08-06',
      lastRequestAt: 1_700_000_000_000,
      requestCount: 2,
    }
    const { store } = makeStore({ [REVIEW_STORAGE_KEY]: JSON.stringify(stored) })
    expect(await hydrateReviewState(store)).toEqual(stored)
  })
})

describe('recordAppOpen', () => {
  it('seeds the first-launch date and counts the first day', async () => {
    const { store, data } = makeStore()
    await hydrateReviewState(store)
    recordAppOpen(new Date(2026, 7, 7))
    expect(getReviewState()).toMatchObject({
      firstLaunchDate: '2026-08-07',
      openDays: 1,
      lastOpenDate: '2026-08-07',
    })
    expect(JSON.parse(data.get(REVIEW_STORAGE_KEY)!).openDays).toBe(1)
  })

  it('is idempotent within a calendar day', async () => {
    const { store } = makeStore()
    await hydrateReviewState(store)
    recordAppOpen(new Date(2026, 7, 7, 8))
    recordAppOpen(new Date(2026, 7, 7, 13))
    recordAppOpen(new Date(2026, 7, 7, 22))
    expect(getReviewState().openDays).toBe(1)
  })

  it('counts each new calendar day and never stores a list of them', async () => {
    const { store, data } = makeStore()
    await hydrateReviewState(store)
    for (const day of [5, 6, 9, 30]) recordAppOpen(new Date(2026, 7, day))
    expect(getReviewState().openDays).toBe(4)
    // Bounded by construction: a count plus one date, whatever the install's age.
    const raw = JSON.parse(data.get(REVIEW_STORAGE_KEY)!)
    expect(Object.keys(raw).sort()).toEqual([
      'firstLaunchDate',
      'lastOpenDate',
      'lastRequestAt',
      'openDays',
      'requestCount',
    ])
    expect(raw.firstLaunchDate).toBe('2026-08-05')
  })

  it('keeps the original first-launch date across later opens', async () => {
    const { store } = makeStore({
      [REVIEW_STORAGE_KEY]: JSON.stringify({
        ...DEFAULT_REVIEW_STATE,
        firstLaunchDate: '2025-01-01',
        openDays: 40,
        lastOpenDate: '2026-08-06',
      }),
    })
    await hydrateReviewState(store)
    recordAppOpen(new Date(2026, 7, 7))
    expect(getReviewState()).toMatchObject({ firstLaunchDate: '2025-01-01', openDays: 41 })
  })
})

describe('recordReviewRequest', () => {
  it('stamps the time and increments the lifetime count immediately', async () => {
    const { store, data } = makeStore()
    await hydrateReviewState(store)
    recordReviewRequest(1_700_000_000_000)
    expect(getReviewState()).toMatchObject({
      lastRequestAt: 1_700_000_000_000,
      requestCount: 1,
    })
    // Written through, not merely cached: the OS gives no success callback, so
    // the attempt must survive the app being killed a second later.
    expect(JSON.parse(data.get(REVIEW_STORAGE_KEY)!)).toMatchObject({
      lastRequestAt: 1_700_000_000_000,
      requestCount: 1,
    })
  })

  it('accumulates toward the lifetime cap', async () => {
    const { store } = makeStore()
    await hydrateReviewState(store)
    recordReviewRequest(1)
    recordReviewRequest(2)
    recordReviewRequest(3)
    expect(getReviewState().requestCount).toBe(3)
  })
})
