import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetViewerPrefsForTest,
  getColumnMode,
  getDefaultColumnMode,
  hydrateViewerPrefs,
  setColumnMode,
  setDefaultColumnMode,
} from '../viewerPrefs'
import type { KVStorage as KV } from '../defaults'

const KEY = 'gc.viewer.columnMode.v1'

function memoryStorage(initial: Record<string, string> = {}): KV & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

// Writes are fire-and-forget; let the microtask queue drain before asserting
// on the backing store.
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  __resetViewerPrefsForTest()
})

describe('viewerPrefs column mode', () => {
  it('resolves to single when nothing is stored (app-wide default)', async () => {
    await hydrateViewerPrefs(memoryStorage())
    expect(getDefaultColumnMode()).toBe('single')
    expect(getColumnMode('amazing-grace')).toBe('single')
    expect(getColumnMode(undefined)).toBe('single')
  })

  it('persists per song and is isolated between songs', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumnMode('song-a', 'double')
    await flush()

    expect(getColumnMode('song-a')).toBe('double')
    expect(getColumnMode('song-b')).toBe('single')
    expect(JSON.parse(s.store.get(KEY)!)).toEqual({ songs: { 'song-a': 'double' } })
  })

  it('survives a simulated reload (reopen a song set to double → still double)', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumnMode('song-a', 'double')
    await flush()

    await hydrateViewerPrefs(memoryStorage()) // fresh empty hydrate = relaunch reset
    expect(getColumnMode('song-a')).toBe('single')

    await hydrateViewerPrefs(s) // reload from the original storage
    expect(getColumnMode('song-a')).toBe('double')
    expect(getColumnMode('song-b')).toBe('single')
  })

  it('does not bloat storage: flipping back to single removes the entry and the key', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumnMode('song-a', 'double')
    await flush()
    expect(s.store.has(KEY)).toBe(true)

    setColumnMode('song-a', 'single')
    await flush()
    expect(getColumnMode('song-a')).toBe('single')
    expect(s.store.has(KEY)).toBe(false)
  })

  it('setting a mode a song already resolves to writes nothing', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumnMode('song-a', 'single') // already the default
    await flush()
    expect(s.store.has(KEY)).toBe(false)
  })

  it('app-wide default seam: overrides resolve against it and prune to it', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setDefaultColumnMode('double')
    await flush()

    expect(getColumnMode('untouched-song')).toBe('double')
    // A per-song 'single' now differs from the default → stored as an override.
    setColumnMode('song-a', 'single')
    await flush()
    expect(getColumnMode('song-a')).toBe('single')
    expect(JSON.parse(s.store.get(KEY)!)).toEqual({
      default: 'double',
      songs: { 'song-a': 'single' },
    })

    // Restoring the default prunes overrides that became redundant.
    setDefaultColumnMode('single')
    await flush()
    expect(getColumnMode('song-a')).toBe('single')
    expect(s.store.has(KEY)).toBe(false)
  })

  it('ignores corrupt or invalid stored data', async () => {
    await hydrateViewerPrefs(memoryStorage({ [KEY]: '{ not json' }))
    expect(getColumnMode('song-a')).toBe('single')

    await hydrateViewerPrefs(
      memoryStorage({ [KEY]: JSON.stringify({ default: 'triple', songs: { 'song-a': 'wide', 'song-b': 'double' } }) }),
    )
    expect(getColumnMode('song-a')).toBe('single')
    expect(getColumnMode('song-b')).toBe('double')
  })
})
