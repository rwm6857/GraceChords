import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetViewerPrefsForTest,
  getColumns,
  hydrateViewerPrefs,
  setColumns,
} from '../viewerPrefs'
import type { KVStorage as KV } from '../defaults'

const KEY = 'gc.viewer.columns.v2'
const LEGACY_KEY = 'gc.viewer.columnMode.v1'

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

describe('viewerPrefs column ceiling', () => {
  it('defaults to a single column when nothing is stored', async () => {
    await hydrateViewerPrefs(memoryStorage())
    expect(getColumns()).toBe(1)
  })

  it('is GLOBAL — one value, not per song', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumns(3)
    // No slug anywhere in the API: every song in every setlist reads the same
    // value, which is the whole point of v2.
    expect(getColumns()).toBe(3)
  })

  it('persists across a relaunch', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumns(2)
    await flush()

    await hydrateViewerPrefs(memoryStorage()) // fresh empty hydrate = other device
    expect(getColumns()).toBe(1)

    await hydrateViewerPrefs(s) // reload from the original storage
    expect(getColumns()).toBe(2)
  })

  it('drops the stored key when set back to the default', async () => {
    const s = memoryStorage()
    await hydrateViewerPrefs(s)
    setColumns(3)
    await flush()
    expect(s.store.has(KEY)).toBe(true)

    setColumns(1)
    await flush()
    expect(s.store.has(KEY)).toBe(false)
    expect(getColumns()).toBe(1)
  })

  it('survives a corrupt or unknown payload', async () => {
    await hydrateViewerPrefs(memoryStorage({ [KEY]: '{ not json' }))
    expect(getColumns()).toBe(1)

    __resetViewerPrefsForTest()
    await hydrateViewerPrefs(memoryStorage({ [KEY]: JSON.stringify({ columns: 7 }) }))
    expect(getColumns()).toBe(1)
  })
})

describe('viewerPrefs v1 → v2 migration', () => {
  it("carries over v1's app-wide default and removes the old key", async () => {
    const s = memoryStorage({
      [LEGACY_KEY]: JSON.stringify({ default: 'double', songs: { 'song-a': 'single' } }),
    })
    await hydrateViewerPrefs(s)
    await flush()

    expect(getColumns()).toBe(2)
    expect(s.store.has(LEGACY_KEY)).toBe(false)
    expect(JSON.parse(s.store.get(KEY)!)).toEqual({ columns: 2 })
  })

  it('drops v1 per-song overrides rather than picking one', async () => {
    const s = memoryStorage({
      [LEGACY_KEY]: JSON.stringify({ songs: { 'song-a': 'double', 'song-b': 'double' } }),
    })
    await hydrateViewerPrefs(s)
    // v1 had no app-wide default here, so the result is the v2 default — the
    // per-song 'double' entries do NOT get promoted.
    expect(getColumns()).toBe(1)
  })

  it('prefers an existing v2 value over a stale v1 payload', async () => {
    const s = memoryStorage({
      [KEY]: JSON.stringify({ columns: 3 }),
      [LEGACY_KEY]: JSON.stringify({ default: 'single' }),
    })
    await hydrateViewerPrefs(s)
    expect(getColumns()).toBe(3)
  })
})
