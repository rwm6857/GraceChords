import { describe, expect, it } from 'vitest'
// Subpath imports, NOT the core barrel — the barrel pulls in the Supabase
// client. These assertions double as proof that subpath resolution works in the
// mobile toolchain, which nothing else in the app exercised before.
import { devotionalDayKey, monthKeyForDate } from '@gracechords/core/devotional/dayKey'
import { getPlanForDate } from '@gracechords/core/bible/plan'
import {
  parseManifest,
  parseSyncState,
  shouldCheck,
  staleMonths,
  withCachedMonth,
  SYNC_INTERVAL_MS,
} from '@gracechords/core/devotional/manifest'

describe('devotionalDayKey', () => {
  it('formats an ordinary date as MM-DD', () => {
    expect(devotionalDayKey(new Date(2026, 7, 7))).toBe('08-07')
    expect(devotionalDayKey(new Date(2026, 0, 1))).toBe('01-01')
    expect(devotionalDayKey(new Date(2026, 11, 31))).toBe('12-31')
  })

  it('repeats 02-28 on a leap day', () => {
    expect(devotionalDayKey(new Date(2028, 1, 29))).toBe('02-28')
    expect(devotionalDayKey(new Date(2028, 1, 28))).toBe('02-28')
    // March 1 must be unaffected -- the old dayOfYear fallback landed there and
    // showed March 1's readings twice.
    expect(devotionalDayKey(new Date(2028, 2, 1))).toBe('03-01')
  })

  /**
   * The invariant the whole feature rests on. Devotionals are paired to days by
   * scripture, so if the devotional key and the readings key ever disagreed the
   * app would show one chapter and a devotional about another.
   */
  it('always resolves the same day as the reading plan, for every day of a leap year', () => {
    const d = new Date(2028, 0, 1)
    let checked = 0
    while (d.getFullYear() === 2028) {
      const planMmdd = getPlanForDate(d).mmdd
      const devKey = devotionalDayKey(d)
      expect(devKey).toBe(`${planMmdd.slice(0, 2)}-${planMmdd.slice(2)}`)
      checked += 1
      d.setDate(d.getDate() + 1)
    }
    expect(checked).toBe(366)
  })

  it('derives the month file from the same clamp', () => {
    expect(monthKeyForDate(new Date(2028, 1, 29))).toBe('02')
    expect(monthKeyForDate(new Date(2026, 10, 4))).toBe('11')
  })
})

describe('manifest', () => {
  const good = {
    schema: 1,
    months: { '01': { file: 'month/01.json', hash: 'aaa', bytes: 10 } },
  }

  it('parses a valid manifest', () => {
    expect(parseManifest(good)?.months['01'].hash).toBe('aaa')
  })

  it('rejects malformed or future-schema payloads instead of throwing', () => {
    expect(parseManifest(null)).toBeNull()
    expect(parseManifest('nope')).toBeNull()
    expect(parseManifest({ schema: 99, months: good.months })).toBeNull()
    expect(parseManifest({ schema: 1, months: {} })).toBeNull()
    expect(parseManifest({ schema: 1, months: { '01': { file: 'x' } } })).toBeNull()
  })

  it('only reports months whose hash differs from the cache', () => {
    const manifest = parseManifest(good)!
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: {} })).toEqual(['01'])
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: { '01': 'aaa' } })).toEqual([])
    expect(staleMonths(manifest, { lastCheckedAt: 0, hashes: { '01': 'old' } })).toEqual(['01'])
  })

  it('checks at most once a day, but recovers from a backwards clock', () => {
    const now = 1_000_000_000_000
    expect(shouldCheck({ lastCheckedAt: 0, hashes: {} }, now)).toBe(true)
    expect(shouldCheck({ lastCheckedAt: now - 1000, hashes: {} }, now)).toBe(false)
    expect(shouldCheck({ lastCheckedAt: now - SYNC_INTERVAL_MS, hashes: {} }, now)).toBe(true)
    expect(shouldCheck({ lastCheckedAt: now + 5_000, hashes: {} }, now)).toBe(true)
  })

  it('round-trips sync state and ignores junk keys', () => {
    const state = withCachedMonth(parseSyncState({ lastCheckedAt: 5, hashes: { '01': 'a', zz: 'b' } }), '02', 'c')
    expect(state.hashes).toEqual({ '01': 'a', '02': 'c' })
    expect(state.lastCheckedAt).toBe(5)
    expect(parseSyncState(undefined)).toEqual({ lastCheckedAt: 0, hashes: {} })
  })
})
