import { describe, expect, it } from 'vitest'
import { BOOKS, formatPassageLabel, type Passage } from '@gracechords/core'

// Passage labels must spell every book in full. A previous `shortBook` helper
// abbreviated exactly two books -- Psalms -> "Ps" and Song of Solomon -> "Song"
// -- which read as a bug next to the 64 books that stayed full-length, and left
// the Daily Word landing ("Ps 1") disagreeing with the reader chips
// ("Psalms 1"). These tests pin the whole canon so no single-book special case
// can creep back in.

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
      (book) => formatPassageLabel(passage(book, 1)) !== `${book} 1`,
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

  it('preserves the leading numeral on numbered books', () => {
    expect(formatPassageLabel(passage('1 Samuel', 17))).toBe('1 Samuel 17')
    expect(formatPassageLabel(passage('2 Chronicles', 7, { start: 14, end: 14 }))).toBe(
      '2 Chronicles 7:14',
    )
    expect(formatPassageLabel(passage('3 John', 1))).toBe('3 John 1')
  })
})
