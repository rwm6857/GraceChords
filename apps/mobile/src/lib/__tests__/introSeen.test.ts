import { describe, expect, it } from 'vitest'
import {
  hasSeenIntro,
  hydrateIntroSeen,
  markIntroSeen,
  type KVStorage,
} from '../introSeen'

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

const KEY = 'gc.intro.seen.v1'

describe('intro seen store', () => {
  it('is false on a fresh install', async () => {
    await hydrateIntroSeen(memoryStorage())
    expect(hasSeenIntro()).toBe(false)
  })

  it('marks seen synchronously and writes through', async () => {
    const s = memoryStorage()
    await hydrateIntroSeen(s)
    markIntroSeen()
    // Synchronous: the auth gate reads this in the same tick the intro navigates.
    expect(hasSeenIntro()).toBe(true)
    expect(s.store.get(KEY)).toBe('1')
  })

  it('stays seen across a relaunch', async () => {
    const s = memoryStorage()
    await hydrateIntroSeen(s)
    markIntroSeen()

    // A different (empty) device reads false again — the flag is per-device.
    await hydrateIntroSeen(memoryStorage())
    expect(hasSeenIntro()).toBe(false)

    // The original device still has it.
    await hydrateIntroSeen(s)
    expect(hasSeenIntro()).toBe(true)
  })

  it('hydrates true only from the exact stored value', async () => {
    await hydrateIntroSeen(memoryStorage({ [KEY]: '1' }))
    expect(hasSeenIntro()).toBe(true)

    // Anything else means "not seen" — show the intro rather than swallow it.
    for (const raw of ['0', '', 'true', 'yes']) {
      await hydrateIntroSeen(memoryStorage({ [KEY]: raw }))
      expect(hasSeenIntro(), `stored ${JSON.stringify(raw)}`).toBe(false)
    }
  })

  it('falls back to not-seen when the read throws', async () => {
    await hydrateIntroSeen(memoryStorage({ [KEY]: '1' }))
    expect(hasSeenIntro()).toBe(true)

    const broken: KVStorage = {
      getItem: async () => {
        throw new Error('storage unavailable')
      },
      setItem: async () => {},
      removeItem: async () => {},
    }
    await hydrateIntroSeen(broken)
    expect(hasSeenIntro()).toBe(false)
  })

  it('is idempotent — a second mark does not write again', async () => {
    const s = memoryStorage()
    await hydrateIntroSeen(s)
    markIntroSeen()
    expect(s.store.get(KEY)).toBe('1')

    // Both CTAs can fire mark+navigate; the repeat must be a no-op so it can't
    // re-emit and re-render the gate mid-navigation.
    s.store.delete(KEY)
    markIntroSeen()
    expect(s.store.has(KEY)).toBe(false)
    expect(hasSeenIntro()).toBe(true)
  })
})
