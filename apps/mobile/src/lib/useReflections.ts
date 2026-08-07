import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  createReflection,
  deleteReflection,
  fetchReflectionForDate,
  fetchReflections,
  isDuplicateReflectionError,
  updateReflection,
  type Reflection,
} from '@gracechords/core'
import { supabase } from './supabase'
import { useCurrentUserState } from './currentUser'
import { reportFailure } from './errors'
import {
  applyReflectionRowChange,
  getReflectionDay,
  reflectionCacheKey,
  reflectionDateKey,
  setReflectionDay,
  subscribeReflectionDays,
} from './reflectionDayStore'

// i18n key for the user-facing failure — never the raw error. See errors.ts.
const LOAD_ERROR_KEY = 'errors:load.reflection'

// Private per-user reflections for the Daily Word landing + journal. No React
// Query — the day read is backed by reflectionDayStore.ts (the same
// module-level-cache pattern as defaults.ts and eight other stores in src/lib),
// and the journal list stays plain loading/error/data like useSetlists. All
// reads/writes are RLS-scoped to the signed-in user; Phase 1 only ever writes
// 'private'.

// Re-exported so callers keep importing it from here (the compose screen does).
export { reflectionDateKey }

/** Thrown by createToday when the day already has a reflection (23505). */
export class DuplicateReflectionError extends Error {
  constructor() {
    super('A reflection already exists for this day.')
    this.name = 'DuplicateReflectionError'
  }
}

// One in-flight read per (user, day), shared by every hook instance.
//
// The landing mounts this hook and ALSO calls refresh() from useFocusEffect,
// which fires on initial focus too — so opening the tab used to issue two
// identical reads. useSetlists avoids that by having no mount fetch, but the
// compose screen has no focus effect and needs one, so the two are coalesced
// here instead. Resolves to an i18n error key on failure rather than throwing,
// because whether a failure is worth showing depends on what the caller already
// has cached.
const inFlight = new Map<string, Promise<string | null>>()

function loadDay(key: string, userId: string | null, dateKey: string): Promise<string | null> {
  const existing = inFlight.get(key)
  if (existing) return existing
  const run = fetchReflectionForDate(supabase, dateKey)
    .then((row) => {
      setReflectionDay(userId, dateKey, (row as Reflection | null) ?? null)
      return null
    })
    .catch((err: unknown) => (reportFailure('useTodayReflection', err) ? LOAD_ERROR_KEY : null))
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, run)
  return run
}

/**
 * The signed-in user's reflection for a single day (defaults to today), plus
 * create/update/delete actions. Used by the landing's "Your reflection" area and
 * the compose screen. `create` rejects with DuplicateReflectionError on a second
 * same-day write so callers can show a graceful message.
 *
 * CACHE-FIRST. A day already read — this session or, for today, a previous
 * launch — is returned synchronously and revalidated in the background, so
 * `loading` is true only when the answer is genuinely unknown. That is what
 * stops the landing spinning on every tab focus, and what lets it render
 * offline.
 */
export function useTodayReflection(dateKey: string = reflectionDateKey(new Date())) {
  const { user, resolved } = useCurrentUserState()
  const userId = user?.id ?? null
  const key = reflectionCacheKey(userId, dateKey)

  const getSnapshot = useCallback(() => getReflectionDay(key), [key])
  const day = useSyncExternalStore(subscribeReflectionDays, getSnapshot, getSnapshot)

  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // Reading before the root has published identity would both waste a request
    // and cache the result under the wrong key. The root resolves the session
    // before the splash lifts, so in practice this only guards a screen mounted
    // outside that gate.
    if (!resolved) return
    setError(null)
    const failure = await loadDay(key, userId, dateKey)
    // A failed revalidation with a cached answer in hand is logged but never
    // surfaced — the card keeps showing what we know, which is what makes this
    // work in airplane mode. Only a failure with nothing cached becomes the
    // error card, which the landing needs: falling through to the compose CTA
    // on an unknown answer invites a rejected duplicate same-day write.
    if (failure && !getReflectionDay(key)) setError(failure)
  }, [resolved, key, userId, dateKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (body: string) => {
      try {
        const row = (await createReflection(supabase, {
          reflectionDate: dateKey,
          body,
        })) as Reflection
        setReflectionDay(userId, dateKey, row)
        return row
      } catch (err: unknown) {
        if (isDuplicateReflectionError(err)) throw new DuplicateReflectionError()
        throw err
      }
    },
    [userId, dateKey],
  )

  // Edit an existing PRIVATE reflection in place (public posts are immutable).
  // Applied by row id rather than to this hook's own day: the compose screen can
  // be opened on a past entry from the journal, in which case the row being
  // edited belongs to a different cached day than the one this instance is for.
  const update = useCallback(async (id: string, body: string) => {
    const row = (await updateReflection(supabase, id, body)) as Reflection
    applyReflectionRowChange(id, row)
    return row
  }, [])

  const remove = useCallback(async () => {
    const current = getReflectionDay(key)?.reflection
    if (!current) return
    await deleteReflection(supabase, current.id)
    setReflectionDay(userId, dateKey, null)
  }, [key, userId, dateKey])

  return {
    reflection: day?.reflection ?? null,
    // Unknown answer and no error to explain why — the only state that earns a
    // spinner. An absent entry means never read; `reflection: null` inside a
    // present entry means read-and-empty.
    loading: day === undefined && error === null,
    error,
    refresh,
    create,
    update,
    remove,
  }
}

/**
 * The signed-in user's reflections, newest day first (the journal screen).
 * `remove` deletes one and drops it from local state.
 */
export function useReflectionList() {
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const rows = (await fetchReflections(supabase)) as Reflection[]
      setReflections(rows)
      setError(null)
    } catch (err: unknown) {
      if (reportFailure('useReflectionList', err)) setError(LOAD_ERROR_KEY)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const update = useCallback(async (id: string, body: string) => {
    const row = (await updateReflection(supabase, id, body)) as Reflection
    setReflections((prev) => prev.map((r) => (r.id === id ? row : r)))
    // The landing may be holding this same row from cache.
    applyReflectionRowChange(id, row)
    return row
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteReflection(supabase, id)
    setReflections((prev) => prev.filter((r) => r.id !== id))
    applyReflectionRowChange(id, null)
  }, [])

  return { reflections, loading, error, refresh, update, remove }
}
