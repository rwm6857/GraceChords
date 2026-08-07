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
import {
  selectDay,
  selectDayForDate,
  selectDevotional,
  siblingDevotional,
} from '@gracechords/core/devotional/selection'
import type { MonthFile } from '@gracechords/core/devotional/types'

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
    schemaVersion: 1,
    contentVersion: 'abc123',
    generatedAt: null,
    months: { '01': { file: 'abc123/month/01.json', hash: 'aaa', bytes: 10 } },
  }

  it('parses a valid manifest', () => {
    const m = parseManifest(good)
    expect(m?.months['01'].hash).toBe('aaa')
    expect(m?.contentVersion).toBe('abc123')
    expect(m?.generatedAt).toBeNull()
  })

  it('rejects malformed or future-schema payloads instead of throwing', () => {
    expect(parseManifest(null)).toBeNull()
    expect(parseManifest('nope')).toBeNull()
    expect(parseManifest({ ...good, schemaVersion: 99 })).toBeNull()
    expect(parseManifest({ ...good, months: {} })).toBeNull()
    expect(parseManifest({ ...good, contentVersion: '' })).toBeNull()
    expect(parseManifest({ ...good, months: { '01': { file: 'x' } } })).toBeNull()
  })

  it('ignores generatedAt entirely when planning a sync', () => {
    // Staleness is decided by content hash alone -- a rebuilt-but-unchanged
    // artifact with a fresh timestamp must not trigger any download.
    const m = parseManifest({ ...good, generatedAt: '2026-08-07T00:00:00Z' })!
    expect(staleMonths(m, { lastCheckedAt: 0, hashes: { '01': 'aaa' } })).toEqual([])
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

describe('selection', () => {
  const month: MonthFile = {
    month: 8,
    schemaVersion: 1,
    days: {
      '08-06': { state: 'two', readings: ['Judges 20', 'Acts 24'], devotionals: [
        { slug: 'judges-20-1', id: 'x', reference: 'Judges 20:1', coreText: '', excerpt: '', author: '', sourceWork: '', matchedChapter: 'Judges 20', timeHint: null, bodyBlocks: [] },
        { slug: 'acts-24-16', id: 'y', reference: 'Acts 24:16', coreText: '', excerpt: '', author: '', sourceWork: '', matchedChapter: 'Acts 24', timeHint: null, bodyBlocks: [] },
      ] },
      '08-07': { state: 'open', readings: ['Judges 21'], devotionals: [] },
    },
  }

  it('selects a day, and distinguishes open from wrong-month', () => {
    expect(selectDay(month, '08-06')?.state).toBe('two')
    expect(selectDay(month, '08-07')?.state).toBe('open')
    // A key from another month is a bug, not an open day.
    expect(selectDay(month, '09-01')).toBeNull()
    expect(selectDay(null, '08-06')).toBeNull()
  })

  it('selects by date through the same leap clamp', () => {
    const feb: MonthFile = {
      month: 2, schemaVersion: 1,
      days: { '02-28': { state: 'one', readings: [], devotionals: [] } },
    }
    expect(selectDayForDate(feb, new Date(2028, 1, 29))?.state).toBe('one')
  })

  it('finds a devotional by slug and its sibling', () => {
    const day = selectDay(month, '08-06')!
    expect(selectDevotional(day, 'acts-24-16')?.id).toBe('y')
    expect(selectDevotional(day, 'nope')).toBeNull()
    expect(siblingDevotional(day, 'acts-24-16')?.slug).toBe('judges-20-1')
    // A one-devotional day has no sibling to offer.
    expect(siblingDevotional(selectDay(month, '08-07'), 'anything')).toBeNull()
  })
})
