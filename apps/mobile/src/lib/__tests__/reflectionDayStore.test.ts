import { beforeEach, describe, expect, it } from 'vitest'
import type { Reflection } from '@gracechords/core'
import {
  __resetReflectionDayStoreForTest,
  applyReflectionRowChange,
  clearReflectionDays,
  getReflectionDay,
  hydrateTodayReflection,
  reflectionCacheKey,
  reflectionDateKey,
  setReflectionDay,
  subscribeReflectionDays,
} from '../reflectionDayStore'
import type { KVStorage } from '../defaults'

// The day cache behind the Daily Word landing. What these tests pin down is the
// difference between "read, and there is none" and "never read" (the landing
// shows a spinner only for the latter), and the user keying that stops one
// account's private reflection reaching the next account on the device.

const STORAGE_KEY = 'gc.reflection.today.v1'

function memoryStorage(
  initial: Record<string, string> = {},
): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

const d = (iso: string) => new Date(`${iso}T12:00:00`)

function reflection(over: Partial<Reflection> = {}): Reflection {
  return {
    id: 'r1',
    user_id: 'user-1',
    reflection_date: '2026-08-07',
    content_key: null,
    visibility: 'private',
    body: 'He restores my soul.',
    created_at: '2026-08-07T09:00:00Z',
    ...over,
  }
}

/** A persisted blob as the store writes it. */
function stored(userId: string, date: string, row: Reflection | null) {
  return JSON.stringify({ userId, date, reflection: row })
}

describe('reflectionDayStore', () => {
  beforeEach(() => __resetReflectionDayStoreForTest())

  it('an unread day is undefined, and a read-but-empty day is a real answer', async () => {
    await hydrateTodayReflection(memoryStorage(), d('2026-08-07'))
    const key = reflectionCacheKey('user-1', '2026-08-07')
    expect(getReflectionDay(key)).toBeUndefined()

    setReflectionDay('user-1', '2026-08-07', null, d('2026-08-07'))
    // Present entry, null reflection — the landing may now show the compose CTA.
    expect(getReflectionDay(key)).toEqual({
      userId: 'user-1',
      date: '2026-08-07',
      reflection: null,
    })
  })

  it('hydrates today’s persisted entry so a cold launch has an answer', async () => {
    const row = reflection()
    const store = memoryStorage({ [STORAGE_KEY]: stored('user-1', '2026-08-07', row) })
    await hydrateTodayReflection(store, d('2026-08-07'))
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))?.reflection).toEqual(row)
  })

  it('drops a persisted entry from an earlier day rather than answering today with it', async () => {
    const store = memoryStorage({
      [STORAGE_KEY]: stored('user-1', '2026-08-06', reflection({ reflection_date: '2026-08-06' })),
    })
    await hydrateTodayReflection(store, d('2026-08-07'))
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))).toBeUndefined()
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-06'))).toBeUndefined()
  })

  it('never serves one user’s cached reflection to another', async () => {
    const store = memoryStorage({
      [STORAGE_KEY]: stored('user-1', '2026-08-07', reflection({ body: 'private to user-1' })),
    })
    await hydrateTodayReflection(store, d('2026-08-07'))
    // The query itself has no user_id filter (RLS scopes it), so the key is the
    // only thing standing between two accounts on one device.
    expect(getReflectionDay(reflectionCacheKey('user-2', '2026-08-07'))).toBeUndefined()
  })

  it('ignores a malformed or absent persisted entry instead of throwing', async () => {
    await hydrateTodayReflection(memoryStorage({ [STORAGE_KEY]: 'not json' }), d('2026-08-07'))
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))).toBeUndefined()

    __resetReflectionDayStoreForTest()
    await hydrateTodayReflection(
      memoryStorage({ [STORAGE_KEY]: JSON.stringify({ userId: 5, date: null }) }),
      d('2026-08-07'),
    )
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))).toBeUndefined()
  })

  it('persists today, and only today', async () => {
    const store = memoryStorage()
    await hydrateTodayReflection(store, d('2026-08-07'))

    setReflectionDay('user-1', '2026-08-07', reflection(), d('2026-08-07'))
    expect(store.store.get(STORAGE_KEY)).toContain('He restores my soul.')

    // Editing an older day from the journal must not evict today's entry.
    setReflectionDay('user-1', '2026-08-01', reflection({ id: 'old', body: 'older' }), d('2026-08-07'))
    expect(store.store.get(STORAGE_KEY)).toContain('He restores my soul.')
    expect(store.store.get(STORAGE_KEY)).not.toContain('older')
    // …but it is still cached in memory for the session.
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-01'))?.reflection?.id).toBe('old')
  })

  it('does not persist a signed-out read', async () => {
    const store = memoryStorage()
    await hydrateTodayReflection(store, d('2026-08-07'))
    setReflectionDay(null, '2026-08-07', null, d('2026-08-07'))
    expect(store.store.has(STORAGE_KEY)).toBe(false)
  })

  it('applies a journal delete to the cached day so the landing stops showing it', async () => {
    const store = memoryStorage()
    await hydrateTodayReflection(store, d('2026-08-07'))
    setReflectionDay('user-1', '2026-08-07', reflection(), d('2026-08-07'))

    applyReflectionRowChange('r1', null, d('2026-08-07'))
    const day = getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))
    // Still a known answer — just an empty one.
    expect(day).toEqual({ userId: 'user-1', date: '2026-08-07', reflection: null })
    expect(store.store.get(STORAGE_KEY)).toBe(stored('user-1', '2026-08-07', null))
  })

  it('applies a journal edit to the cached day and leaves other rows alone', async () => {
    await hydrateTodayReflection(memoryStorage(), d('2026-08-07'))
    setReflectionDay('user-1', '2026-08-07', reflection(), d('2026-08-07'))
    setReflectionDay('user-1', '2026-08-01', reflection({ id: 'other' }), d('2026-08-07'))

    applyReflectionRowChange('r1', reflection({ body: 'edited' }), d('2026-08-07'))
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))?.reflection?.body).toBe(
      'edited',
    )
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-01'))?.reflection?.body).toBe(
      'He restores my soul.',
    )
  })

  it('sign-out clears memory and the persisted copy', async () => {
    const store = memoryStorage()
    await hydrateTodayReflection(store, d('2026-08-07'))
    setReflectionDay('user-1', '2026-08-07', reflection(), d('2026-08-07'))

    clearReflectionDays()
    expect(getReflectionDay(reflectionCacheKey('user-1', '2026-08-07'))).toBeUndefined()
    expect(store.store.has(STORAGE_KEY)).toBe(false)
  })

  it('notifies subscribers on write, and stops after unsubscribe', async () => {
    await hydrateTodayReflection(memoryStorage(), d('2026-08-07'))
    let calls = 0
    const unsubscribe = subscribeReflectionDays(() => {
      calls += 1
    })
    setReflectionDay('user-1', '2026-08-07', reflection(), d('2026-08-07'))
    expect(calls).toBe(1)

    // A row change that matches nothing must not wake React for no reason.
    applyReflectionRowChange('does-not-exist', null, d('2026-08-07'))
    expect(calls).toBe(1)

    unsubscribe()
    setReflectionDay('user-1', '2026-08-07', null, d('2026-08-07'))
    expect(calls).toBe(1)
  })

  it('returns a reference-stable snapshot between writes (useSyncExternalStore)', async () => {
    await hydrateTodayReflection(memoryStorage(), d('2026-08-07'))
    setReflectionDay('user-1', '2026-08-07', reflection(), d('2026-08-07'))
    const key = reflectionCacheKey('user-1', '2026-08-07')
    expect(getReflectionDay(key)).toBe(getReflectionDay(key))
  })

  it('reflectionDateKey uses the local calendar day, not UTC', () => {
    // 23:30 local on the 7th is the 8th in UTC; the reflection belongs to the 7th.
    expect(reflectionDateKey(new Date('2026-08-07T23:30:00'))).toBe('2026-08-07')
    expect(reflectionDateKey(new Date('2026-01-05T00:15:00'))).toBe('2026-01-05')
  })
})
