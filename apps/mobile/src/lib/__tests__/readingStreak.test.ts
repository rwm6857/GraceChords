import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetReadingStreakForTest,
  currentStreak,
  getReadingStreak,
  hydrateReadingStreak,
  markReadToday,
  setStreakEnabled,
  streakDateKey,
} from '../readingStreak'
import type { KVStorage } from '../defaults'

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

const d = (iso: string) => new Date(`${iso}T12:00:00`)

describe('reading streak', () => {
  beforeEach(() => __resetReadingStreakForTest())

  it('is disabled by default and marking is a no-op while disabled', async () => {
    await hydrateReadingStreak(memoryStorage())
    expect(getReadingStreak()).toEqual({ enabled: false, count: 0, lastReadDate: null })

    markReadToday(d('2026-07-07'))
    expect(getReadingStreak().count).toBe(0)
    expect(currentStreak(getReadingStreak(), d('2026-07-07'))).toBe(0)
  })

  it('marks are idempotent within a day', async () => {
    await hydrateReadingStreak(memoryStorage())
    setStreakEnabled(true)
    markReadToday(d('2026-07-07'))
    markReadToday(d('2026-07-07'))
    expect(getReadingStreak().count).toBe(1)
  })

  it('consecutive days extend the streak; a gap restarts at 1', async () => {
    await hydrateReadingStreak(memoryStorage())
    setStreakEnabled(true)
    markReadToday(d('2026-07-05'))
    markReadToday(d('2026-07-06'))
    markReadToday(d('2026-07-07'))
    expect(getReadingStreak().count).toBe(3)

    markReadToday(d('2026-07-10')) // missed the 8th and 9th
    expect(getReadingStreak().count).toBe(1)
  })

  it('currentStreak shows the count while alive (read today or yesterday), else 0', async () => {
    await hydrateReadingStreak(memoryStorage())
    setStreakEnabled(true)
    markReadToday(d('2026-07-06'))
    markReadToday(d('2026-07-07'))

    const s = getReadingStreak()
    expect(currentStreak(s, d('2026-07-07'))).toBe(2) // read today
    expect(currentStreak(s, d('2026-07-08'))).toBe(2) // yesterday — still alive
    expect(currentStreak(s, d('2026-07-09'))).toBe(0) // broken
  })

  it('currentStreak is 0 when disabled even with stored history', async () => {
    await hydrateReadingStreak(memoryStorage())
    setStreakEnabled(true)
    markReadToday(d('2026-07-07'))
    setStreakEnabled(false)
    expect(currentStreak(getReadingStreak(), d('2026-07-07'))).toBe(0)
  })

  it('persists enable state and count across a simulated reload', async () => {
    const s = memoryStorage()
    await hydrateReadingStreak(s)
    setStreakEnabled(true)
    markReadToday(d('2026-07-06'))
    markReadToday(d('2026-07-07'))

    __resetReadingStreakForTest()
    await hydrateReadingStreak(s)
    expect(getReadingStreak()).toEqual({
      enabled: true,
      count: 2,
      lastReadDate: streakDateKey(d('2026-07-07')),
    })
  })

  it('falls back to the disabled default on a corrupt read', async () => {
    const s = memoryStorage({ 'gc.readingStreak.v1': '{not json' })
    await hydrateReadingStreak(s)
    expect(getReadingStreak()).toEqual({ enabled: false, count: 0, lastReadDate: null })
  })
})
