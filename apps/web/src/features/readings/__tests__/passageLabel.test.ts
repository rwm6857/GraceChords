import { describe, expect, it } from 'vitest'
import { BOOKS } from '@gracechords/core'
import { formatPassageLabel } from '../selection'
import type { Passage } from '../types'

// Web keeps its own copy of selection.ts alongside the shared one in
// @gracechords/core, so the "spell every book in full" rule has to be pinned on
// both sides. A previous `shortBook` helper abbreviated exactly two books --
// Psalms -> "Ps" and Song of Solomon -> "Song" -- which read as a bug next to
// the 64 that stayed full-length. See the sibling test in apps/mobile.

const passage = (book: string, chapter: number, range: Passage['range'] = null): Passage => ({
  bookNumber: BOOKS.indexOf(book) + 1,
  book,
  chapter,
  range,
})

describe('formatPassageLabel', () => {
  it('spells all 66 books in full', () => {
    expect(BOOKS).toHaveLength(66)
    const abbreviated = BOOKS.filter(
      (book: string) => formatPassageLabel(passage(book, 1)) !== `${book} 1`,
    )
    expect(abbreviated).toEqual([])
  })

  it('does not abbreviate the two books shortBook used to special-case', () => {
    expect(formatPassageLabel(passage('Psalms', 1))).toBe('Psalms 1')
    expect(formatPassageLabel(passage('Song of Solomon', 2))).toBe('Song of Solomon 2')
  })

  it('keeps the full book name across every verse-range shape', () => {
    const psalms = (range: Passage['range']) => formatPassageLabel(passage('Psalms', 119, range))
    expect(psalms(null)).toBe('Psalms 119')
    expect(psalms({ start: 105, end: 105 })).toBe('Psalms 119:105')
    expect(psalms({ start: 1, end: 8 })).toBe('Psalms 119:1-8')
    expect(psalms({ start: 169, end: null })).toBe('Psalms 119:169-')
  })
})
