import { describe, expect, it } from 'vitest'
import { chunkRows } from '../gridRows'

describe('chunkRows', () => {
  it('chunks row-major into full rows of N', () => {
    expect(chunkRows([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ])
  })

  it('keeps the remainder as a shorter final row', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns no rows for an empty section', () => {
    expect(chunkRows([], 3)).toEqual([])
  })

  it('puts everything in one row when columns exceed the item count', () => {
    expect(chunkRows([1, 2], 5)).toEqual([[1, 2]])
  })

  it('clamps degenerate column counts to single-item rows', () => {
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]])
  })

  it('preserves item order across rows', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(chunkRows(items, 3).flat()).toEqual(items)
  })
})
