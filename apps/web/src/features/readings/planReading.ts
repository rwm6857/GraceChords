import { bookNumberToName, parseVerseReference } from '../../utils/songs/verseRef'
import type { PlanReading } from './types'

export type RawPlanReading = string | PlanReading

export function normalizePlanReading(input: RawPlanReading): PlanReading | null {
  if (typeof input === 'object' && input) {
    const book = Number((input as PlanReading).book)
    const ref = String((input as PlanReading).ref || '').trim()
    if (!book || book < 1 || book > 66 || !ref) return null
    const bookName = bookNumberToName(book)
    if (!bookName) return null
    const parsed = parseVerseReference(`${bookName} ${ref}`)
    if (parsed.error) return null
    return {
      book: parsed.bookNumber,
      ref: parsed.ref,
    }
  }

  const raw = String(input || '').trim()
  if (!raw) return null
  const parsed = parseVerseReference(raw)
  if (parsed.error) return null
  return {
    book: parsed.bookNumber,
    ref: parsed.ref,
  }
}

