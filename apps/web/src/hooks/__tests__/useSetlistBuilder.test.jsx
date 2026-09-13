import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The save machine is the risky part of the builder: a debounce, serialized
// writes, and a hydration gate that exists because of a real data-loss bug.
// Everything below exercises that machine, so core and supabase are stubbed.

const fetchSetlist = vi.fn()
const updateSetlist = vi.fn()
const deleteSetlist = vi.fn()

vi.mock('@gracechords/core', async () => {
  const actual = await vi.importActual('@gracechords/core')
  return {
    ...actual,
    fetchSetlist: (...a) => fetchSetlist(...a),
    updateSetlist: (...a) => updateSetlist(...a),
    deleteSetlist: (...a) => deleteSetlist(...a),
  }
})
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../useSongs', () => ({ useSongs: () => ({ songs: [], loading: false }) }))

const SAVED = {
  id: 'set-1',
  name: 'Sunday Morning',
  service_date: null,
  updated_at: '2026-09-10T00:00:00.000Z',
  entries: [
    {
      id: 'row-1',
      song_id: 'uuid-a',
      position: 0,
      toKey: null,
      notes: null,
      song: { slug: 'abba', title: 'Abba', artist: null, default_key: 'D', tempo: 128, time_signature: '4/4' },
    },
  ],
}

let useSetlistBuilder

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  fetchSetlist.mockResolvedValue(SAVED)
  updateSetlist.mockResolvedValue(undefined)
  deleteSetlist.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  ;({ useSetlistBuilder } = await import('../useSetlistBuilder'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function mountLoaded() {
  const view = renderHook(() => useSetlistBuilder('set-1'))
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return view
}

describe('useSetlistBuilder', () => {
  it('loads a setlist and exposes its entries', async () => {
    const { result } = await mountLoaded()
    expect(result.current.name).toBe('Sunday Morning')
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].song.title).toBe('Abba')
    expect(updateSetlist).not.toHaveBeenCalled()
  })

  it('coalesces rapid edits into a single write', async () => {
    const { result } = await mountLoaded()

    await act(async () => {
      result.current.setName('A')
      result.current.setName('Ab')
      result.current.setName('Abc')
    })
    expect(updateSetlist).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(900)
    })
    await waitFor(() => expect(updateSetlist).toHaveBeenCalledTimes(1))
    expect(updateSetlist.mock.calls[0][2]).toMatchObject({ name: 'Abc' })
  })

  it('serializes saves, queueing at most one trailing write', async () => {
    let release
    updateSetlist.mockImplementation(
      () => new Promise((resolve) => { release = resolve })
    )
    const { result } = await mountLoaded()

    await act(async () => {
      result.current.setName('first')
      vi.advanceTimersByTime(900)
    })
    await waitFor(() => expect(updateSetlist).toHaveBeenCalledTimes(1))

    // Three more edits while the first write is still in flight must collapse
    // into exactly one trailing save, not three.
    await act(async () => {
      result.current.setName('second')
      vi.advanceTimersByTime(900)
      result.current.setName('third')
      vi.advanceTimersByTime(900)
      result.current.setName('fourth')
      vi.advanceTimersByTime(900)
    })
    expect(updateSetlist).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
      await Promise.resolve()
    })
    await waitFor(() => expect(updateSetlist).toHaveBeenCalledTimes(2))
    expect(updateSetlist.mock.calls[1][2]).toMatchObject({ name: 'fourth' })
  })

  it('never saves after a failed load', async () => {
    // The regression this guards: a failed load cleared `loading`, hydration
    // flipped on anyway, and the next edit saved the INITIAL empty state —
    // wipe-and-replace then renamed the set and deleted every song in it.
    fetchSetlist.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSetlistBuilder('set-1'))
    await waitFor(() => expect(result.current.loadFailed).toBe(true))

    await act(async () => {
      result.current.setName('clobber')
      vi.advanceTimersByTime(5000)
    })
    expect(updateSetlist).not.toHaveBeenCalled()
  })

  it('defers an edit made before the load resolves instead of dropping it', async () => {
    let resolveLoad
    fetchSetlist.mockImplementation(() => new Promise((r) => { resolveLoad = r }))
    const { result } = renderHook(() => useSetlistBuilder('set-1'))

    await act(async () => {
      result.current.setName('typed early')
      vi.advanceTimersByTime(2000)
    })
    expect(updateSetlist).not.toHaveBeenCalled()

    await act(async () => {
      resolveLoad(SAVED)
      await Promise.resolve()
      vi.advanceTimersByTime(2000)
    })
    await waitFor(() => expect(updateSetlist).toHaveBeenCalledTimes(1))
  })

  it('flushes a pending save when the tab is hidden', async () => {
    const { result } = await mountLoaded()
    await act(async () => {
      result.current.setName('hidden')
    })
    expect(updateSetlist).not.toHaveBeenCalled()

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(updateSetlist).toHaveBeenCalledTimes(1))
  })

  it('untoggling a song kept for a reprise removes only the last of them', async () => {
    // A song can legitimately appear twice (a reprise). Untoggling it in the
    // library must take the LAST entry, leaving the earlier one in place.
    const song = { dbId: 'uuid-b', id: 'grace', title: 'Grace', authors: [], originalKey: 'G' }
    const { result } = await mountLoaded()

    await act(async () => { result.current.toggleSong(song) })
    const added = result.current.items.find((i) => i.songId === 'uuid-b')
    await act(async () => { result.current.duplicateEntry(added.entryKey) })
    expect(result.current.items.map((i) => i.songId)).toEqual(['uuid-a', 'uuid-b', 'uuid-b'])

    await act(async () => { result.current.toggleSong(song) })
    expect(result.current.items.map((i) => i.songId)).toEqual(['uuid-a', 'uuid-b'])
    // The surviving entry is the FIRST of the pair, not the copy.
    expect(result.current.items[1].entryKey).toBe(added.entryKey)
  })

  it('stops saving once the setlist is deleted', async () => {
    const { result } = await mountLoaded()
    await act(async () => {
      await result.current.deleteSet()
    })
    await act(async () => {
      result.current.setName('after delete')
      vi.advanceTimersByTime(5000)
    })
    expect(deleteSetlist).toHaveBeenCalledTimes(1)
    expect(updateSetlist).not.toHaveBeenCalled()
  })
})
