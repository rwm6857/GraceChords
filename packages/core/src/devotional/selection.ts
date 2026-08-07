// Selecting a day's devotionals out of loaded month data.
//
// Pure lookup over already-parsed month files: no I/O, no fetch, no filesystem.
// Loading a month is the platform layer's job — mobile reads a bundled or cached
// file, web will fetch it — so this stays shared and testable.

import { devotionalDayKey, monthOfDayKey } from './dayKey'
import type { DayEntry, Devotional, MonthFile } from './types'

/** An open day: present in the artifact, but carrying nothing. */
export function openDay(): DayEntry {
  return { state: 'open', readings: [], devotionals: [] }
}

/**
 * The day entry for a key like `08-07`, or null when the month does not hold it.
 *
 * Returns null rather than an open day for a missing key, so a caller can tell
 * "this day is legitimately empty" (state `open`) from "the wrong month is
 * loaded", which is a bug.
 */
export function selectDay(month: MonthFile | null | undefined, dayKey: string): DayEntry | null {
  if (!month) return null
  if (monthOfDayKey(dayKey) !== String(month.month).padStart(2, '0')) return null
  return month.days?.[dayKey] ?? null
}

/**
 * The day entry for a Date, resolved through the same clamp the reading plan
 * uses — so the devotionals returned are always the ones matched against the
 * readings shown for that same date.
 */
export function selectDayForDate(month: MonthFile | null | undefined, date: Date): DayEntry | null {
  return selectDay(month, devotionalDayKey(date))
}

/** One devotional from a day by slug. Slugs are unique within a day. */
export function selectDevotional(day: DayEntry | null | undefined, slug: string): Devotional | null {
  if (!day) return null
  return day.devotionals.find((d) => d.slug === slug) ?? null
}

/**
 * The other devotional on a two-devotional day, for sibling navigation.
 * Null when the day holds only one.
 */
export function siblingDevotional(day: DayEntry | null | undefined, slug: string): Devotional | null {
  if (!day || day.devotionals.length < 2) return null
  return day.devotionals.find((d) => d.slug !== slug) ?? null
}
