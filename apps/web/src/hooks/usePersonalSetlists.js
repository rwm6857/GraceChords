// The signed-in user's personal setlists, for the workspace's setlists rail.
//
// Mirrors apps/mobile/src/lib/useSetlists.ts over the same core repo, so both
// clients list, create, duplicate and delete through one implementation. The
// role cap comes from useAuth rather than a second `users` read, since the web
// auth context already resolves the role.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  fetchPersonalSetlists,
  nextCopyName,
  personalSetlistLimit,
} from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function toRow(row) {
  return {
    id: row.id,
    name: row.name,
    service_date: row.service_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    songCount: row.setlist_songs?.[0]?.count ?? 0,
  }
}

export function usePersonalSetlists() {
  const { role, isLoggedIn } = useAuth()
  const [setlists, setSetlists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const alive = useRef(true)
  // Mirrors `setlists` so callbacks can read the current list without taking a
  // dependency on it (which would re-create every handler on each refresh).
  const latest = useRef([])
  latest.current = setlists

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setSetlists([])
      setLoading(false)
      return
    }
    try {
      const rows = await fetchPersonalSetlists(supabase)
      if (!alive.current) return
      setSetlists((rows || []).map(toRow))
      setError(false)
    } catch (err) {
      console.error('[usePersonalSetlists] load:', err)
      if (alive.current) setError(true)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [isLoggedIn])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  // `id` lets the caller mint the uuid and navigate before the INSERT lands.
  const create = useCallback(async (opts = {}) => {
    const row = await createSetlist(supabase, opts)
    if (alive.current) {
      setSetlists((prev) => [
        {
          id: row.id,
          name: row.name,
          service_date: row.service_date,
          created_at: row.created_at,
          updated_at: row.updated_at,
          songCount: 0,
        },
        ...prev.filter((s) => s.id !== row.id),
      ])
    }
    return row
  }, [])

  // Optimistic: the rail shows the new set before the INSERT resolves, so the
  // caller can navigate into it immediately.
  const addOptimistic = useCallback((id, name) => {
    setSetlists((prev) => [
      {
        id,
        name,
        service_date: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        songCount: 0,
      },
      ...prev.filter((s) => s.id !== id),
    ])
  }, [])

  const dropOptimistic = useCallback((id) => {
    setSetlists((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const rename = useCallback((id, name) => {
    setSetlists((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [])

  // Numbered against the names already in the list ("Sunday" -> "Sunday (2)"),
  // so a copy is distinguishable at a glance instead of adding a second
  // identical row.
  const duplicate = useCallback(
    async (id) => {
      const rows = latest.current
      const row = rows.find((s) => s.id === id)
      const name = nextCopyName(
        row?.name || 'New Setlist',
        rows.map((s) => s.name)
      )
      const copy = await duplicateSetlist(supabase, id, name)
      await refresh()
      return copy
    },
    [refresh]
  )

  const remove = useCallback(async (id) => {
    await deleteSetlist(supabase, id)
    if (alive.current) setSetlists((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // The limit-reached prune flow deletes several at once.
  const removeMany = useCallback(async (ids) => {
    await Promise.all(ids.map((id) => deleteSetlist(supabase, id)))
    const gone = new Set(ids)
    if (alive.current) setSetlists((prev) => prev.filter((s) => !gone.has(s.id)))
  }, [])

  const limit = personalSetlistLimit(role)

  return {
    setlists,
    loading,
    error,
    refresh,
    create,
    addOptimistic,
    dropOptimistic,
    rename,
    duplicate,
    remove,
    removeMany,
    limit,
    atLimit: Number.isFinite(limit) && setlists.length >= limit,
  }
}
