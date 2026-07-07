import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetRecentsForTest,
  getRecentlyOpened,
  hydrateRecents,
  recordSongOpened,
  updateRecentKey,
} from '../recents'
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

const songA = { id: 'a', slug: 'song-a', title: 'Song A', artist: 'X', default_key: 'G' }
const songB = { id: 'b', slug: 'song-b', title: 'Song B', artist: null, default_key: null }

describe('recently-opened history (getRecentlyOpened seam)', () => {
  beforeEach(() => __resetRecentsForTest())

  it('returns [] before anything is opened (unchanged contract)', async () => {
    await hydrateRecents(memoryStorage())
    expect(getRecentlyOpened()).toEqual([])
  })

  it('records opens newest-first and returns full Song shapes', async () => {
    await hydrateRecents(memoryStorage())
    recordSongOpened(songA)
    recordSongOpened(songB)

    const list = getRecentlyOpened()
    expect(list.map((s) => s.slug)).toEqual(['song-b', 'song-a'])
    // Seam contract: each item is a Song (nullable tags/created_at included).
    expect(list[0]).toMatchObject({
      id: 'b',
      slug: 'song-b',
      title: 'Song B',
      artist: null,
      default_key: null,
      time_signature: null,
      tempo: null,
      tags: null,
      created_at: null,
    })
    // No internal openedAt leaks into the returned Song.
    expect('openedAt' in list[0]).toBe(false)
  })

  it('de-dupes by slug, moving a re-opened song to the front', async () => {
    await hydrateRecents(memoryStorage())
    recordSongOpened(songA)
    recordSongOpened(songB)
    recordSongOpened(songA)

    const list = getRecentlyOpened()
    expect(list.map((s) => s.slug)).toEqual(['song-a', 'song-b'])
    expect(list.length).toBe(2)
  })

  it('stores the viewed key: seeded on record, mirrored by updateRecentKey', async () => {
    await hydrateRecents(memoryStorage())
    recordSongOpened(songA)
    expect(getRecentlyOpened()[0]?.lastKey).toBe(null)

    updateRecentKey('song-a', 'A')
    expect(getRecentlyOpened()[0]?.lastKey).toBe('A')

    // Update is in place — no reorder, and unknown slugs are a no-op.
    recordSongOpened(songB)
    updateRecentKey('song-a', 'Bb')
    updateRecentKey('missing', 'C')
    expect(getRecentlyOpened().map((s) => [s.slug, s.lastKey])).toEqual([
      ['song-b', null],
      ['song-a', 'Bb'],
    ])
  })

  it('re-recording a song resets lastKey to the new open', async () => {
    await hydrateRecents(memoryStorage())
    recordSongOpened(songA)
    updateRecentKey('song-a', 'A')
    recordSongOpened(songA) // reopened (e.g. from the Library, default key)
    expect(getRecentlyOpened()[0]?.lastKey).toBe(null)
  })

  it('persists lastKey across a simulated reload and tolerates pre-lastKey data', async () => {
    const s = memoryStorage()
    await hydrateRecents(s)
    recordSongOpened(songA)
    updateRecentKey('song-a', 'D')

    __resetRecentsForTest()
    await hydrateRecents(s)
    expect(getRecentlyOpened()[0]?.lastKey).toBe('D')

    // Entries written before the field existed normalize to null.
    const legacy = memoryStorage({
      'gc.recents.songs.v1': JSON.stringify([
        { ...songA, time_signature: null, tempo: null, tags: null, created_at: null, openedAt: '2026-01-01T00:00:00.000Z' },
      ]),
    })
    __resetRecentsForTest()
    await hydrateRecents(legacy)
    expect(getRecentlyOpened()[0]?.lastKey).toBe(null)
  })

  it('survives a simulated reload (re-hydrate from the same storage)', async () => {
    const s = memoryStorage()
    await hydrateRecents(s)
    recordSongOpened(songA)

    __resetRecentsForTest()
    await hydrateRecents(memoryStorage())
    expect(getRecentlyOpened()).toEqual([])

    await hydrateRecents(s)
    expect(getRecentlyOpened()[0]?.slug).toBe('song-a')
  })
})
