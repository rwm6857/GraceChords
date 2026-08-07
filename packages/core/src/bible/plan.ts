// M'Cheyne one-year reading plan: date → passages. Pure, DOM-free. Ported from
// apps/web/src/features/readings (useMcheyne.ts + planReading.ts +
// expandReadings.ts), reusing core's verse-reference parser so the plan and the
// song library share one book/reference vocabulary.

import { bookNumberToName, parseVerseReference } from '../songs/verseRef'
import planData from './mcheyne.plan.json'
import type { Passage, PlanEntry, PlanReading } from './types'

export type RawPlanReading = string | PlanReading

type RawPlanEntry = {
  mmdd: string
  readings: RawPlanReading[]
}

export function normalizePlanReading(input: RawPlanReading): PlanReading | null {
  if (typeof input === 'object' && input) {
    const book = Number((input as PlanReading).book)
    const ref = String((input as PlanReading).ref || '').trim()
    if (!book || book < 1 || book > 66 || !ref) return null
    const bookName = bookNumberToName(book)
    if (!bookName) return null
    const parsed = parseVerseReference(`${bookName} ${ref}`)
    if (parsed.error || parsed.bookNumber == null || parsed.ref == null) return null
    return { book: parsed.bookNumber, ref: parsed.ref }
  }

  const raw = String(input || '').trim()
  if (!raw) return null
  const parsed = parseVerseReference(raw)
  if (parsed.error || parsed.bookNumber == null || parsed.ref == null) return null
  return { book: parsed.bookNumber, ref: parsed.ref }
}

const PLAN: PlanEntry[] = (planData as RawPlanEntry[]).map((entry) => ({
  mmdd: entry.mmdd,
  readings: entry.readings
    .map((reading) => normalizePlanReading(reading))
    .filter((reading): reading is PlanReading => Boolean(reading)),
}))

const planByMmdd = new Map<string, { entry: PlanEntry, index: number }>(
  PLAN.map((p, i) => [p.mmdd, { entry: p, index: i }])
)

export function mmddFromDate(date: Date){
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}${dd}`
}

export function addDays(date: Date, delta: number){
  const next = new Date(date)
  next.setDate(next.getDate() + delta)
  return next
}

/**
 * Resolve a date to the MMDD key the 365-day plan actually holds.
 *
 * The only date the plan has no entry for is February 29, which repeats
 * February 28. Repeating the preceding day (rather than the old
 * `dayOfYear % 365` fallback, which landed on March 1 and so showed March 1's
 * readings twice in a row) keeps the plan's sequence intact and — critically —
 * lets the devotional artifact resolve the SAME key from the SAME date. Any
 * other resolution would let the readings and the devotional matched to those
 * readings drift apart on the leap day.
 */
export function resolvePlanMmdd(date: Date): string {
  const mmdd = mmddFromDate(date)
  if (planByMmdd.has(mmdd)) return mmdd
  return mmdd === '0229' ? '0228' : mmdd
}

export function getPlanForDate(date: Date){
  const mmdd = resolvePlanMmdd(date)
  const direct = planByMmdd.get(mmdd)
  if (direct){
    return { mmdd, readings: direct.entry.readings, index: direct.index }
  }
  // Unreachable for any real Date: every MMDD except 0229 is in the table and
  // 0229 clamps above. Kept so a malformed key degrades instead of throwing.
  const entry = PLAN[0]
  return { mmdd: entry.mmdd, readings: entry.readings, index: 0 }
}

export function expandReadings(readings: RawPlanReading[]): Passage[] {
  return readings.flatMap((raw) => expandReading(raw)).filter(Boolean)
}

export function expandReading(raw: RawPlanReading): Passage[] {
  const normalized = normalizePlanReading(raw)
  if (!normalized) return []

  const book = bookNumberToName(normalized.book)
  if (!book) return []
  const parsed = parseVerseReference(`${book} ${normalized.ref}`)
  if (parsed.error || !parsed.segments) return []

  const passages: Passage[] = []
  for (const segment of parsed.segments) {
    if (!segment.ranges) {
      passages.push({ bookNumber: normalized.book, book, chapter: segment.chapter, range: null })
      continue
    }
    for (const range of segment.ranges) {
      passages.push({
        bookNumber: normalized.book,
        book,
        chapter: segment.chapter,
        range: { start: range.start, end: range.end },
      })
    }
  }
  return passages
}
