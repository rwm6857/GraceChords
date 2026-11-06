import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SESSION_HEARTBEAT_MS } from '@gracechords/core'
import {
  createLiveSessionStore,
  parseItemIndex,
  sourceFromRow,
  sourceRoute,
  type LiveDeps,
  type LiveRow,
} from '../liveSession'

const SET = { kind: 'set', setlistId: 'set-1' } as const
const SONG = { kind: 'song', slug: 'abba' } as const

type MockDeps = { [K in keyof LiveDeps]: Mock<LiveDeps[K]> }

function makeDeps(overrides: Partial<MockDeps> = {}): MockDeps {
  const deps: MockDeps = {
    buildSnapshot: vi.fn((entries: unknown[]) => entries.map((_, i) => ({ uid: `i${i}`, kind: 'song' as const, slug: `s${i}` }))),
    createSession: vi.fn(async () => ({
      id: 'sess-1', code: 'AAA222', chord_code: 'BBB333', setlist_id: 'set-1',
      items: [], current_item_uid: 'i0', transpose: 0, current_key: null,
    })),
    updateCurrentItem: vi.fn(async () => {}),
    endSession: vi.fn(async () => {}),
    ...overrides,
  }
  return deps
}

function liveRow(over: Partial<LiveRow> = {}): LiveRow {
  return {
    id: 'sess-9', code: 'CCC444', chord_code: 'DDD555', setlist_id: 'set-1',
    items: [{ uid: 'i0', kind: 'song', slug: 'a' }, { uid: 'i1', kind: 'song', slug: 'b' }, { uid: 'i2', kind: 'song', slug: 'c' }],
    current_item_uid: 'i2', transpose: 3, current_key: 'D',
    ...over,
  }
}

const lastWrite = (deps: MockDeps) => deps.updateCurrentItem.mock.calls.at(-1)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('liveSession store', () => {
  it('starts a set session and debounces + de-dupes position broadcasts', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}, {}], 'Sunday')
    expect(deps.createSession).toHaveBeenCalledWith({ setlistId: 'set-1', items: expect.any(Array) })
    expect(store.getState().active).toMatchObject({ id: 'sess-1', source: SET, label: 'Sunday' })

    expect(store.attach(SET)).toBeNull()
    store.setPosition({ itemUid: 'i0', transpose: 0, currentKey: 'G' })
    store.setPosition({ itemUid: 'i1', transpose: 2, currentKey: 'A' })
    vi.advanceTimersByTime(300)
    expect(deps.updateCurrentItem).toHaveBeenCalledTimes(1)
    expect(lastWrite(deps)).toEqual(['sess-1', { itemUid: 'i1', transpose: 2, currentKey: 'A' }])

    store.setPosition({ itemUid: 'i1', transpose: 2, currentKey: 'A' })
    vi.advanceTimersByTime(300)
    expect(deps.updateCurrentItem).toHaveBeenCalledTimes(1)
  })

  it('creates a single-song session with no setlist', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SONG, [{}], 'Abba')
    expect(deps.createSession).toHaveBeenCalledWith({ setlistId: null, items: [expect.objectContaining({ uid: 'i0' })] })
  })

  it('heartbeat carries the current position, and nulls once detached', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}, {}], null)
    store.attach(SET)
    store.setPosition({ itemUid: 'i1', transpose: 5, currentKey: 'C' })
    vi.advanceTimersByTime(300)
    deps.updateCurrentItem.mockClear()

    vi.advanceTimersByTime(SESSION_HEARTBEAT_MS)
    expect(lastWrite(deps)).toEqual(['sess-1', { itemUid: 'i1', transpose: 5, currentKey: 'C' }])

    store.detach()
    vi.advanceTimersByTime(SESSION_HEARTBEAT_MS)
    expect(lastWrite(deps)).toEqual(['sess-1', { itemUid: null, transpose: 0, currentKey: null }])
  })

  it('re-sends a position whose write failed on the next heartbeat', async () => {
    const deps = makeDeps()
    deps.updateCurrentItem.mockRejectedValueOnce(new Error('offline'))
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}, {}], null)
    store.attach(SET)
    store.setPosition({ itemUid: 'i1', transpose: 0, currentKey: null })
    vi.advanceTimersByTime(300)
    vi.advanceTimersByTime(SESSION_HEARTBEAT_MS)
    expect(deps.updateCurrentItem).toHaveBeenCalledTimes(2)
    expect(lastWrite(deps)?.[1]).toEqual({ itemUid: 'i1', transpose: 0, currentKey: null })
  })

  it('detach writes nothing-open immediately and keeps the session live', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}], null)
    store.attach(SET)
    store.setPosition({ itemUid: 'i0', transpose: 0, currentKey: null })
    store.detach()
    expect(lastWrite(deps)).toEqual(['sess-1', { itemUid: null, transpose: 0, currentKey: null }])
    vi.advanceTimersByTime(300)
    expect(deps.updateCurrentItem).toHaveBeenCalledTimes(1) // the pending debounce was cancelled
    expect(deps.endSession).not.toHaveBeenCalled()
    expect(store.getState().active).not.toBeNull()
  })

  it('keeps state when End fails so it can be retried', async () => {
    const deps = makeDeps({ endSession: vi.fn().mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce(undefined) })
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}], null)
    await expect(store.end()).rejects.toThrow('nope')
    expect(store.getState()).toMatchObject({ busy: false, active: { id: 'sess-1' } })
    await store.end()
    expect(store.getState().active).toBeNull()
  })

  it('adopts a relaunched row, maps its source, and restores its position once', () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    store.adopt(liveRow())
    expect(store.getState().active?.source).toEqual(SET)
    expect(store.attach(SET)).toEqual({ itemUid: 'i2', transpose: 3, currentKey: 'D' })

    // Broadcasts are held until the screen has applied the restore...
    store.setPosition({ itemUid: 'i0', transpose: 0, currentKey: null })
    vi.advanceTimersByTime(300)
    expect(deps.updateCurrentItem).not.toHaveBeenCalled()
    store.release()
    store.setPosition({ itemUid: 'i2', transpose: 3, currentKey: 'D' })
    vi.advanceTimersByTime(300)
    expect(lastWrite(deps)?.[1]).toEqual({ itemUid: 'i2', transpose: 3, currentKey: 'D' })
  })

  it('prefers the row position, then this run’s last position, on re-attach', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    store.adopt(liveRow({ current_item_uid: null }))
    expect(store.attach(SET)).toBeNull()
    store.setPosition({ itemUid: 'i1', transpose: 1, currentKey: 'E' })
    store.detach()
    expect(store.attach(SET)).toEqual({ itemUid: 'i1', transpose: 1, currentKey: 'E' })
  })

  it('does not attach a screen for a different source', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}], null)
    expect(store.attach(SONG)).toBeNull()
    store.setPosition({ itemUid: 'i0', transpose: 0, currentKey: null })
    vi.advanceTimersByTime(300)
    expect(deps.updateCurrentItem).not.toHaveBeenCalled()
  })

  it('refuses to start a second session while one is live', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}], null)
    await expect(store.start(SONG, [{}], null)).rejects.toThrow('session_active')
    await store.end()
    await store.start(SONG, [{}], null)
    expect(deps.createSession).toHaveBeenCalledTimes(2)
  })

  it('stops the heartbeat after End', async () => {
    const deps = makeDeps()
    const store = createLiveSessionStore(deps)
    await store.start(SET, [{}], null)
    await store.end()
    vi.advanceTimersByTime(SESSION_HEARTBEAT_MS * 3)
    expect(deps.updateCurrentItem).not.toHaveBeenCalled()
  })
})

describe('liveSession helpers', () => {
  it('maps rows to sources', () => {
    expect(sourceFromRow({ setlist_id: 'x', items: [] })).toEqual({ kind: 'set', setlistId: 'x' })
    expect(sourceFromRow({ setlist_id: null, items: [{ uid: 'i0', kind: 'song', slug: 'abba' }] })).toEqual(SONG)
    expect(sourceFromRow({ setlist_id: null, items: [{ uid: 'i0', kind: 'song', slug: 'a' }, { uid: 'i1', kind: 'song', slug: 'b' }] })).toBeNull()
    expect(sourceFromRow({ setlist_id: null, items: [{ uid: 'i0', kind: 'unavailable' }] })).toBeNull()
  })

  it('builds routes and parses item indexes', () => {
    expect(sourceRoute(SET)).toBe('/perform/set-1')
    expect(sourceRoute(SONG)).toBe('/viewer/abba')
    expect(parseItemIndex('i12')).toBe(12)
    expect(parseItemIndex(null)).toBeNull()
    expect(parseItemIndex('x1')).toBeNull()
  })
})
