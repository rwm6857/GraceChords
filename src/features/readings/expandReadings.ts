import { bookNumberToName, parseVerseReference } from '../../utils/songs/verseRef'
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
