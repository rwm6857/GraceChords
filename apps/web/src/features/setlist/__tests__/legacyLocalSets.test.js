import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  clearLegacyLocalSets,
  dismissLegacyLocalSets,
  readLegacyLocalSets,
} from '../legacyLocalSets'

const KEY = 'gracechords.sets.v1'

function seed(sets) {
  localStorage.setItem(KEY, JSON.stringify({ sets }))
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('legacyLocalSets', () => {
  it('reads the old store, oldest first', () => {
    seed({
      b: { id: 'b', name: 'Newer', items: [{ id: 'abba', toKey: 'D' }], updatedAt: 200 },
      a: { id: 'a', name: 'Older', items: [], updatedAt: 100 },
    })
    expect(readLegacyLocalSets().map((s) => s.name)).toEqual(['Older', 'Newer'])
    expect(readLegacyLocalSets()[1].items).toEqual([{ id: 'abba', toKey: 'D' }])
  })

  it('returns nothing when there is no old store', () => {
    expect(readLegacyLocalSets()).toEqual([])
  })

  it('returns nothing rather than throwing on a corrupt store', () => {
    localStorage.setItem(KEY, 'not json')
    expect(readLegacyLocalSets()).toEqual([])
  })

  it('drops malformed sets and entries instead of importing junk', () => {
    seed({
      a: { id: 'a', name: 'Kept', items: [{ id: 'abba' }, null, { toKey: 'G' }], updatedAt: 1 },
      bad: { name: 'No id' },
    })
    const out = readLegacyLocalSets()
    expect(out).toHaveLength(1)
    expect(out[0].items).toEqual([{ id: 'abba', toKey: '' }])
  })

  it('stops offering the import once dismissed, without deleting anything', () => {
    seed({ a: { id: 'a', name: 'Kept', items: [], updatedAt: 1 } })
    dismissLegacyLocalSets()
    expect(readLegacyLocalSets()).toEqual([])
    // The user's data is still there — only the prompt is suppressed.
    expect(localStorage.getItem(KEY)).not.toBeNull()
  })

  it('clears the store after a successful import', () => {
    seed({ a: { id: 'a', name: 'Kept', items: [], updatedAt: 1 } })
    clearLegacyLocalSets()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(readLegacyLocalSets()).toEqual([])
  })

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readLegacyLocalSets()).toEqual([])
  })
})
