import { bookNumberToName, parseVerseReference } from '../../utils/songs/verseRef'
import { chaptersInBook } from '@gracechords/core/bible/chapterCounts'
import { normalizePlanReading, type RawPlanReading } from './planReading'
import type { Passage } from './types'

export function expandReadings(readings: RawPlanReading[]): Passage[] {
  return readings.flatMap((raw) => expandReading(raw)).filter(Boolean)
}

export function expandReading(raw: RawPlanReading): Passage[] {
  const normalized = normalizePlanReading(raw)
  if (!normalized) return []

  const book = bookNumberToName(normalized.book)
  if (!book) return []
  // The verse parser reads a bare number on a one-chapter book as a VERSE
  // ("Jude 24" in a song's references), so "Philemon 1" would expand to
  // Philemon 1:1. The plan is chapter-based: a bare "1" there is the whole
  // book.
  if (chaptersInBook(normalized.book) === 1 && normalized.ref === '1') {
    return [{ bookNumber: normalized.book, book, chapter: 1, range: null }]
  }
  const parsed = parseVerseReference(`${book} ${normalized.ref}`)
  if (parsed.error) return []

  const passages: Passage[] = []
  for (const segment of parsed.segments) {
    if (!segment.ranges) {
      passages.push({
        bookNumber: normalized.book,
        book,
        chapter: segment.chapter,
        range: null,
      })
      continue
    }
    for (const range of segment.ranges) {
      passages.push({
        bookNumber: normalized.book,
        book,
        chapter: segment.chapter,
        range: {
          start: range.start,
          end: range.end,
        },
      })
    }
  }
  return passages
}
