import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const SONGS = [
  { dbId: 'uuid-a', id: 'abba', title: 'Abba', authors: [], originalKey: 'D', tempo: 128 },
  { dbId: 'uuid-b', id: 'grace', title: 'Grace', authors: ['John Newton'], originalKey: 'G', tempo: 72 },
]

vi.mock('../useSongs', () => ({ useSongs: () => ({ songs: SONGS, loading: false }) }))

let useDraftSetlist
let DRAFT_STORAGE_KEY

beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  ;({ useDraftSetlist, DRAFT_STORAGE_KEY } = await import('../useDraftSetlist'))
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function stored() {
  return JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY))
}

describe('useDraftSetlist', () => {
  it('persists every edit immediately, with no save step', () => {
    const { result } = renderHook(() => useDraftSetlist())

    act(() => { result.current.toggleSong(SONGS[0]) })
    act(() => { result.current.setName('Sunday') })

    expect(stored()).toMatchObject({
      name: 'Sunday',
      entries: [{ songId: 'abba', toKey: null }],
    })
  })

  it('restores a draft written by an earlier visit', async () => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ name: 'Kept', serviceDate: null, entries: [{ songId: 'grace', toKey: 'A' }] })
    )
    vi.resetModules()
    ;({ useDraftSetlist } = await import('../useDraftSetlist'))

    const { result } = renderHook(() => useDraftSetlist())
    expect(result.current.name).toBe('Kept')
    expect(result.current.items).toHaveLength(1)
    // Hydrated from the catalog by slug, since a draft has no embedded song.
    expect(result.current.items[0].song.title).toBe('Grace')
    expect(result.current.items[0].toKey).toBe('A')
  })

  it('starts empty rather than throwing on a corrupt draft', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{ not json')
    vi.resetModules()
    ;({ useDraftSetlist } = await import('../useDraftSetlist'))

    const { result } = renderHook(() => useDraftSetlist())
    expect(result.current.items).toEqual([])
    expect(result.current.name).toBe('')
  })

  it('survives storage being unavailable', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useDraftSetlist())

    act(() => { result.current.toggleSong(SONGS[0]) })
    // The in-memory draft still works for this visit.
    expect(result.current.items).toHaveLength(1)
    setItem.mockRestore()
  })

  it('reorders and re-keys entries by entryKey', () => {
    const { result } = renderHook(() => useDraftSetlist())
    act(() => { result.current.toggleSong(SONGS[0]) })
    act(() => { result.current.toggleSong(SONGS[1]) })

    const [first, second] = result.current.items
    act(() => { result.current.moveEntry(second.entryKey, first.entryKey) })
    expect(result.current.items.map((i) => i.songId)).toEqual(['grace', 'abba'])

    act(() => { result.current.setKeyFor(result.current.items[0].entryKey, 'Bb') })
    expect(stored().entries[0]).toEqual({ songId: 'grace', toKey: 'Bb' })
  })

  it('clears storage on reset', () => {
    const { result } = renderHook(() => useDraftSetlist())
    act(() => { result.current.toggleSong(SONGS[0]) })
    expect(stored().entries).toHaveLength(1)

    act(() => { result.current.reset() })
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull()
    expect(result.current.items).toEqual([])
  })
})
