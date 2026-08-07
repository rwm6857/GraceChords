import { useEffect, useMemo, useState } from 'react'
import { devotionalDayKey } from '@gracechords/core/devotional/dayKey'
import type { DayEntry } from '@gracechords/core/devotional/types'
import { readDay, readDayCached } from './source'

// A day's devotionals, for the home cards and the devotional route.
//
// ONE DATE SOURCE. `devotionalDayKey` does not implement its own calendar logic:
// it delegates to `resolvePlanMmdd`, the exact function `getPlanForDate` uses to
// pick the day's M'Cheyne readings. The devotionals shown are therefore always
// the ones matched against the readings shown, by construction rather than by two
// implementations agreeing — including on the leap day, where both resolve 02-28.
// A drift here would show one chapter's readings beside a devotional about
// another, and would only reproduce near midnight in some timezones.
//
// NO SPINNER, EVER. The bundled month is read synchronously in `useMemo`, so the
// first paint already has real content. A cached (synced) month can only be read
// asynchronously, so it is applied afterwards and only when it differs — the
// worst case is one extra render, never an empty frame.

export type DevotionalDay = {
  /** `MM-DD`, resolved through the reading plan's own clamp. */
  dayKey: string
  /** Null only if the month itself is unreadable; an empty day is `state: 'open'`. */
  day: DayEntry | null
}

export function useDevotionalDay(date: Date): DevotionalDay {
  const dayKey = devotionalDayKey(date)

  // Keyed on the resolved day, so this re-derives when the calendar day rolls
  // over rather than on every render.
  const bundled = useMemo(() => readDay(dayKey), [dayKey])
  const [day, setDay] = useState<DayEntry | null>(bundled)

  useEffect(() => {
    setDay(bundled)
    let cancelled = false
    readDayCached(dayKey)
      .then((cached) => {
        if (cancelled || !cached) return
        setDay(cached)
      })
      // Cache problems are invisible: the bundled baseline is always valid.
      .catch(() => {})
    return () => { cancelled = true }
  }, [dayKey, bundled])

  return { dayKey, day }
}

/** Today's devotionals. */
export function useTodayDevotionals(): DevotionalDay {
  // A new Date() per render would be a new object every time; the day key it
  // resolves to is what the memo above actually depends on.
  const today = useMemo(() => new Date(), [])
  return useDevotionalDay(today)
}
