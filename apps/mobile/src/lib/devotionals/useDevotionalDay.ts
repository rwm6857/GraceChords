import { useEffect, useMemo, useState } from 'react'
import { devotionalDayKey } from '@gracechords/core/devotional/dayKey'
import type { DayEntry } from '@gracechords/core/devotional/types'
import { ensureDay, readDay } from './source'

// A day's devotionals, for the home cards and the devotional route.
//
// ONE DATE SOURCE. `devotionalDayKey` does not implement its own calendar logic:
// it delegates to `resolvePlanMmdd`, the exact function `getPlanForDate` uses to
// pick the day's M'Cheyne readings. The devotionals shown are therefore always
// the ones matched against the readings shown, by construction rather than by two
// implementations agreeing — including on the leap day, where both resolve 02-28.
// A drift here would put one chapter's readings beside a devotional about another
// and would only reproduce near midnight in some timezones.
//
// NO SPINNER. There is no bundled content, so on a fresh install there is nothing
// to show until a fetch lands. `day` stays null through that, and the caller
// renders nothing at all — an absent card is honest, where a spinner over content
// that may not exist is not. After the first sync a cached month is a pure local
// read and the card is present on the first frame.

export type DevotionalDay = {
  /** `MM-DD`, resolved through the reading plan's own clamp. */
  dayKey: string
  /**
   * Null while the month is not cached yet. A day that legitimately has no
   * devotional resolves to an entry with `state: 'open'` — so a caller can
   * distinguish "nothing written for today" from "not downloaded yet".
   */
  day: DayEntry | null
  /** True once a lookup has settled, cached or not. Not a loading spinner cue. */
  resolved: boolean
}

export function useDevotionalDay(date: Date): DevotionalDay {
  const dayKey = devotionalDayKey(date)
  const [day, setDay] = useState<DayEntry | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDay(null)
    setResolved(false)

    // Cache first, so an already-synced month paints without touching the
    // network; only then fall back to fetching the month.
    readDay(dayKey)
      .then((cached) => {
        if (cancelled) return
        if (cached) {
          setDay(cached)
          setResolved(true)
          return
        }
        return ensureDay(dayKey).then((fetched) => {
          if (cancelled) return
          setDay(fetched)
          setResolved(true)
        })
      })
      // Failures are invisible: the slot simply stays empty.
      .catch(() => { if (!cancelled) setResolved(true) })

    return () => { cancelled = true }
  }, [dayKey])

  return { dayKey, day, resolved }
}

/** Today's devotionals. */
export function useTodayDevotionals(): DevotionalDay {
  // A fresh Date per render would be a new object every time; the day key it
  // resolves to is what the effect actually depends on.
  const today = useMemo(() => new Date(), [])
  return useDevotionalDay(today)
}
