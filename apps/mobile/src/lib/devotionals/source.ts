import { parseMonthFile } from '@gracechords/core/devotional/manifest'
import { monthOfDayKey } from '@gracechords/core/devotional/dayKey'
import { selectDay } from '@gracechords/core/devotional/selection'
import type { DayEntry, MonthFile } from '@gracechords/core/devotional/types'
import { loadBundledMonth } from './months'
import { monthRelPath } from './paths'

// Read seam for devotional content.
//
// READ ORDER: cached month file if present → bundled month file. NEVER a network
// round trip. Sync (R2) is a strictly background concern and lives in sync.ts;
// nothing here fetches, and rendering never waits on it.
//
// The bundled read is synchronous, which is what lets the first paint show real
// content with no spinner. A cached month can only be read asynchronously —
// expo-file-system's File API has no synchronous text read — so the cache is
// applied as a second step: render bundled immediately, then swap in the cached
// copy if one exists. `readDayCached()` exposes that, and `readDay()` is the
// synchronous baseline. A day's content therefore never blocks on I/O; the worst
// case is one extra render when a newer cached month is available.

/** Memoized parsed months, so a month is validated once per app session. */
const memo = new Map<string, MonthFile | null>()

function parse(payload: unknown, monthKey: string): MonthFile | null {
  const parsed = parseMonthFile(payload)
  if (!parsed) {
    if (__DEV__ && payload) console.warn(`[devotionals] month ${monthKey} failed validation`)
    return null
  }
  return parsed
}

/** The bundled month, parsed and memoized. Synchronous. */
export function readBundledMonth(monthKey: string): MonthFile | null {
  const hit = memo.get(monthKey)
  if (hit !== undefined) return hit
  const parsed = parse(loadBundledMonth(monthKey), monthKey)
  memo.set(monthKey, parsed)
  return parsed
}

/**
 * A day's devotionals from bundled content. Synchronous, allocation-cheap, and
 * safe to call during render.
 *
 * Returns null only when the month itself is unreadable. A day with no
 * devotional returns an entry with `state: 'open'` — the artifact carries every
 * day key precisely so a lookup never misses.
 */
export function readDay(dayKey: string): DayEntry | null {
  return selectDay(readBundledMonth(monthOfDayKey(dayKey)), dayKey)
}

/**
 * A day's devotionals preferring the cached (synced) month over the bundled one.
 *
 * Resolves to null when nothing beats what `readDay` already returned, so a
 * caller can skip a re-render. Any failure — no cache, unreadable file, invalid
 * payload — resolves null and is silent: the bundled baseline is always a valid
 * answer, so a cache problem must never surface to the user.
 */
export async function readDayCached(dayKey: string): Promise<DayEntry | null> {
  const monthKey = monthOfDayKey(dayKey)
  try {
    // Loaded lazily so expo-file-system stays out of the synchronous read path
    // (and out of unit tests, which exercise readDay without a native module).
    const { readCachedMonthText } = await import('./cacheStore')
    const text = await readCachedMonthText(monthRelPath(monthKey))
    if (!text) return null
    const parsed = parse(JSON.parse(text) as unknown, monthKey)
    if (!parsed) return null
    memo.set(monthKey, parsed)
    return selectDay(parsed, dayKey)
  } catch {
    return null
  }
}

/** Drop memoized months so a freshly synced file is picked up. */
export function invalidateMonthCache(monthKey?: string): void {
  if (monthKey) memo.delete(monthKey)
  else memo.clear()
}
