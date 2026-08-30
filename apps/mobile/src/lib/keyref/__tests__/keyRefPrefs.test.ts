import { beforeEach, describe, expect, it } from 'vitest'
import type { KVStorage } from '../../defaults'
import {
  DEFAULT_KEY_REF_PREFS,
  __resetKeyRefPrefsForTest,
  getKeyRefPrefs,
  hydrateKeyRefPrefs,
  setDisplayMode,
  setSelectedProgression,
} from '../keyRefPrefs'
import { DEFAULT_PROGRESSION_ID } from '../progressions'

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
    expect(getKeyRefPrefs().selectedId).toBe(DEFAULT_PROGRESSION_ID)
  })

  it('restores what was written', async () => {
    const store = memoryStorage()
    await hydrateKeyRefPrefs(store)
    setSelectedProgression('pIntense')
    setDisplayMode('nashville')

    __resetKeyRefPrefsForTest()
    await hydrateKeyRefPrefs(memoryStorage(Object.fromEntries(store.map)))
    expect(getKeyRefPrefs().selectedId).toBe('pIntense')
    expect(getKeyRefPrefs().display).toBe('nashville')
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

  it('falls back when the stored id is no longer in the data', async () => {
    await hydrateKeyRefPrefs(
      memoryStorage({ [KEY]: JSON.stringify({ selectedId: 'retired-id', display: 'letters' }) }),
    )
    expect(getKeyRefPrefs().selectedId).toBe(DEFAULT_PROGRESSION_ID)
  })

  it('ignores the pinned array a previous version wrote, keeping its display mode', async () => {
    // The four pinned slots became one scrollable list; an old payload still has
    // to leave the user's spelling preference alone.
    await hydrateKeyRefPrefs(
      memoryStorage({
        [KEY]: JSON.stringify({ pinned: ['g145', null, null, 'pFull'], display: 'numbers' }),
      }),
    )
    expect(getKeyRefPrefs().display).toBe('numbers')
    expect(getKeyRefPrefs().selectedId).toBe(DEFAULT_PROGRESSION_ID)
  })

  it('falls back to letters for an unrecognized display mode', async () => {
    await hydrateKeyRefPrefs(
      memoryStorage({ [KEY]: JSON.stringify({ display: 'solfege' }) }),
    )
    expect(getKeyRefPrefs().display).toBe('letters')
  })

  it('accepts every display mode it ships', async () => {
    for (const mode of ['letters', 'numbers', 'nashville'] as const) {
      __resetKeyRefPrefsForTest()
      await hydrateKeyRefPrefs(memoryStorage({ [KEY]: JSON.stringify({ display: mode }) }))
      expect(getKeyRefPrefs().display).toBe(mode)
    }
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
    setSelectedProgression('pBright')
    expect(getKeyRefPrefs()).not.toBe(before)
    expect(getKeyRefPrefs().selectedId).toBe('pBright')
  })

  it('keeps the snapshot stable when nothing actually changed', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    const before = getKeyRefPrefs()
    setDisplayMode(before.display)
    setSelectedProgression(before.selectedId)
    expect(getKeyRefPrefs()).toBe(before)
  })

  it('clears the selection', async () => {
    await hydrateKeyRefPrefs(memoryStorage())
    setSelectedProgression(null)
    expect(getKeyRefPrefs().selectedId).toBeNull()
  })
})
