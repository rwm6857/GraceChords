import { useCallback, useEffect, useState } from 'react'
import {
  createReflection,
  deleteReflection,
  fetchReflectionForDate,
  fetchReflections,
  isDuplicateReflectionError,
  type Reflection,
} from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

// Private per-user reflections for the Daily Word landing + journal. Same plain
// loading/error/data pattern as useSetlists — no React Query. All reads/writes
// are RLS-scoped to the signed-in user; Phase 1 only ever writes 'private'.

/** Local-time day key (YYYY-MM-DD) — reflections follow the user's calendar day. */
export function reflectionDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Thrown by createToday when the day already has a reflection (23505). */
export class DuplicateReflectionError extends Error {
  constructor() {
    super('A reflection already exists for this day.')
    this.name = 'DuplicateReflectionError'
  }
}

/**
 * The signed-in user's reflection for a single day (defaults to today), plus a
 * create action. Used by the landing's "Your reflection" area and the compose
 * screen. `create` rejects with DuplicateReflectionError on a second same-day
 * write so callers can show a graceful message.
 */
export function useTodayReflection(dateKey: string = reflectionDateKey(new Date())) {
  const [reflection, setReflection] = useState<Reflection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const row = (await fetchReflectionForDate(supabase, dateKey)) as Reflection | null
      setReflection(row)
      setError(null)
    } catch (err: unknown) {
      setError(errMessage(err))
    } finally {
      setLoading(false)
    }
  }, [dateKey])

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
        setReflection(row)
        return row
      } catch (err: unknown) {
        if (isDuplicateReflectionError(err)) throw new DuplicateReflectionError()
        throw err
      }
    },
    [dateKey],
  )

  const remove = useCallback(async () => {
    if (!reflection) return
    await deleteReflection(supabase, reflection.id)
    setReflection(null)
  }, [reflection])

  return { reflection, loading, error, refresh, create, remove }
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
      setError(errMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await deleteReflection(supabase, id)
    setReflections((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return { reflections, loading, error, refresh, remove }
}
