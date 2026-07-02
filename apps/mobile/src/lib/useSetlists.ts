import { useCallback, useEffect, useState } from 'react'
import { createSetlist, deleteSetlist, fetchPersonalSetlists } from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

// A setlist row as the Setlists tab needs it: metadata plus a song count
// (flattened from the PostgREST `setlist_songs(count)` relationship embed).
export type SetlistRow = {
  id: string
  name: string
  service_date: string | null
  updated_at: string
  songCount: number
}

type RawRow = {
  id: string
  name: string
  service_date: string | null
  updated_at: string
  setlist_songs: Array<{ count: number }>
}

// The user's personal setlists (newest-edited first), with create/remove.
// Same plain loading/error/data pattern as useSongList — no React Query.
export function useSetlists() {
  const [setlists, setSetlists] = useState<SetlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const rows = (await fetchPersonalSetlists(supabase)) as RawRow[]
      setSetlists(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          service_date: row.service_date,
          updated_at: row.updated_at,
          songCount: row.setlist_songs?.[0]?.count ?? 0,
        })),
      )
      setError(null)
    } catch (err: unknown) {
      setError(errMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(async (name?: string) => {
    const row = (await createSetlist(supabase, { name })) as {
      id: string
      name: string
    }
    return row
  }, [])

  const remove = useCallback(
    async (id: string) => {
      await deleteSetlist(supabase, id)
      setSetlists((prev) => prev.filter((s) => s.id !== id))
    },
    [],
  )

  return { setlists, loading, error, refresh, create, remove }
}
