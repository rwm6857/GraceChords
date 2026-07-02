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

function dayOfYear(date: Date){
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function getPlanForDate(date: Date){
  const mmdd = mmddFromDate(date)
  const direct = planByMmdd.get(mmdd)
  if (direct){
    return { mmdd, readings: direct.entry.readings, index: direct.index }
  }
  // Fallback for dates not in the MMDD table (e.g. leap day).
  const idx = dayOfYear(date) % PLAN.length
  const entry = PLAN[idx]
  return { mmdd: entry.mmdd, readings: entry.readings, index: idx }
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
