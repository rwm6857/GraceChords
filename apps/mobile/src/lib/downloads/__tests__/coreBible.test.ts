import { describe, expect, it } from 'vitest'
import { allChapters, chaptersInBook, TOTAL_BIBLE_CHAPTERS } from '@gracechords/core'

// The downloader enumerates chapters from core's canonical table; a wrong count
// would silently under/over-download a translation.
describe('canonical Bible chapter counts', () => {
  it('totals 1189 chapters across 66 books', () => {
    expect(TOTAL_BIBLE_CHAPTERS).toBe(1189)
    expect(allChapters().length).toBe(1189)
  })

  it('knows representative per-book counts', () => {
    expect(chaptersInBook(1)).toBe(50) // Genesis
    expect(chaptersInBook(19)).toBe(150) // Psalms
    expect(chaptersInBook(66)).toBe(22) // Revelation
    expect(chaptersInBook(0)).toBe(0) // out of range
    expect(chaptersInBook(67)).toBe(0) // out of range
  })

  it('emits chapters in canonical order starting at book 1 chapter 1', () => {
    const all = allChapters()
    expect(all[0]).toEqual({ bookNumber: 1, chapter: 1 })
    expect(all[all.length - 1]).toEqual({ bookNumber: 66, chapter: 22 })
  })
})
