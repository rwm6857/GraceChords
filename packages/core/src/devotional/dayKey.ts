// Day-key resolution for devotional lookup.
//
// THE INVARIANT: the devotional shown on a date must be the one matched to the
// readings shown on that same date. The pairing is by scripture passage, so if
// the two resolved different days the whole feature would be silently wrong —
// the readings would show one chapter and the devotional would be about
// another. That is exactly the failure this module exists to make impossible.
//
// It is made impossible by construction rather than by convention: this file
// does not implement its own calendar logic. It delegates to the reading plan's
// own resolver and only reformats the result. There is one date→day decision in
// the codebase, and it lives with the plan.

import { resolvePlanMmdd } from '../bible/plan'

/**
 * The `MM-DD` key for a date's devotionals, matching the day whose readings the
 * devotionals were paired against.
 *
 * February 29 resolves to `02-28`, repeating that day — the same clamp
 * `resolvePlanMmdd` applies to the readings, because it IS that clamp.
 */
export function devotionalDayKey(date: Date): string {
  const mmdd = resolvePlanMmdd(date)
  return `${mmdd.slice(0, 2)}-${mmdd.slice(2)}`
}

/** Zero-padded month (`"01"`–`"12"`) for a day key — the month file to load. */
export function monthOfDayKey(dayKey: string): string {
  return dayKey.slice(0, 2)
}

/** Zero-padded month for a date, via the same clamp as `devotionalDayKey`. */
export function monthKeyForDate(date: Date): string {
  return monthOfDayKey(devotionalDayKey(date))
}
