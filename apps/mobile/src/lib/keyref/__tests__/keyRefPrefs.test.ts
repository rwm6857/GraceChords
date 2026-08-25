import { beforeEach, describe, expect, it } from 'vitest'
import type { KVStorage } from '../../defaults'
import {
  DEFAULT_KEY_REF_PREFS,
  PIN_COUNT,
  __resetKeyRefPrefsForTest,
  getKeyRefPrefs,
  hydrateKeyRefPrefs,
  setDisplayMode,
  setPinned,
} from '../keyRefPrefs'

const KEY = 'gc.keyref.v1'

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  const store: KVStorage & { map: Map<string, string> } = {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v)
    },
    removeItem: async (k) => {
      map.delete(k)
    },
  }
  return store
}

beforeEach(() => {
  __resetKeyRefPrefsForTest()
})

describe('hydration', () => {
  it('starts from the defaults when nothing is stored', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    expect(getKeyRefPrefs()).toEqual(DEFAULT_KEY_REF_PREFS)
  })

  it('restores what was written', async () => {
    const store = memoryStorage()
    await hydrateKeyRefPrefs(store)
    setPinned(2, 'pIntense')
    setDisplayMode('numbers')

    __resetKeyRefPrefsForTest()
    await hydrateKeyRefPrefs(memoryStorage(Object.fromEntries(store.map)))
    expect(getKeyRefPrefs().pinned[2]).toBe('pIntense')
    expect(getKeyRefPrefs().display).toBe('numbers')
  })

  it('survives a corrupt payload', async () => {
    await hydrateKeyRefPrefs(memoryStorage({ [KEY]: 'not json' }))
    expect(getKeyRefPrefs()).toEqual(DEFAULT_KEY_REF_PREFS)
  })

  it('survives a read that throws', async () => {
    await hydrateKeyRefPrefs({
      getItem: async () => {
        throw new Error('nope')
      },
      setItem: async () => {},
      removeItem: async () => {},
    })
    expect(getKeyRefPrefs()).toEqual(DEFAULT_KEY_REF_PREFS)
  })

  it('drops an id the data no longer has rather than wedging the strip', async () => {
    await hydrateKeyRefPrefs(
      memoryStorage({
        [KEY]: JSON.stringify({ pinned: ['g145', 'retired-id', null, 'pFull'], display: 'letters' }),
      }),
    )
    expect(getKeyRefPrefs().pinned).toEqual(['g145', null, null, 'pFull'])
  })

  it('normalizes a short or long stored list to the slot count', async () => {
    await hydrateKeyRefPrefs(
      memoryStorage({ [KEY]: JSON.stringify({ pinned: ['g145'], display: 'numbers' }) }),
    )
    expect(getKeyRefPrefs().pinned).toHaveLength(PIN_COUNT)
    expect(getKeyRefPrefs().pinned).toEqual(['g145', null, null, null])
  })

  it('falls back to letters for an unrecognized display mode', async () => {
    await hydrateKeyRefPrefs(
      memoryStorage({ [KEY]: JSON.stringify({ pinned: [], display: 'solfege' }) }),
    )
    expect(getKeyRefPrefs().display).toBe('letters')
  })

  it('does not re-read over an unwritten change when the screen remounts', async () => {
    const store = memoryStorage()
    await hydrateKeyRefPrefs(store)
    setDisplayMode('numbers')
    await hydrateKeyRefPrefs(store)
    expect(getKeyRefPrefs().display).toBe('numbers')
  })
})

describe('writes', () => {
  it('replaces the snapshot object so subscribers see a change', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    const before = getKeyRefPrefs()
    setPinned(0, 'pBright')
    expect(getKeyRefPrefs()).not.toBe(before)
    expect(getKeyRefPrefs().pinned[0]).toBe('pBright')
  })

  it('keeps the snapshot stable when nothing actually changed', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    const before = getKeyRefPrefs()
    setDisplayMode(before.display)
    setPinned(0, before.pinned[0])
    expect(getKeyRefPrefs()).toBe(before)
  })

  it('clears a slot', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    setPinned(1, null)
    expect(getKeyRefPrefs().pinned[1]).toBeNull()
  })

  it('ignores a slot outside the strip', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    const before = getKeyRefPrefs()
    setPinned(-1, 'g145')
    setPinned(PIN_COUNT, 'g145')
    expect(getKeyRefPrefs()).toBe(before)
  })
})
