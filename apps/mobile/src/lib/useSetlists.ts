import { useCallback, useState } from 'react'
import {
  createSetlist,
  deleteSetlist,
  fetchPersonalSetlists,
  personalSetlistLimit,
} from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

// A setlist row as the Setlists tab needs it: metadata plus a song count
// (flattened from the PostgREST `setlist_songs(count)` relationship embed).
export type SetlistRow = {
  id: string
  name: string
  service_date: string | null
  created_at: string
  updated_at: string
  songCount: number
}

type RawRow = {
  id: string
  name: string
  service_date: string | null
  created_at: string
  updated_at: string
  setlist_songs: Array<{ count: number }>
}

// The user's personal setlists (newest-edited first), with create/remove.
// Same plain loading/error/data pattern as useSongList — no React Query.
export function useSetlists() {
  const [setlists, setSetlists] = useState<SetlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The signed-in user's per-role personal setlist cap (Infinity for owner).
  // Defaults to the base `user` cap until the role read resolves.
  const [limit, setLimit] = useState<number>(() => personalSetlistLimit('user'))

  const refresh = useCallback(async () => {
    try {
      const [rows] = await Promise.all([
        fetchPersonalSetlists(supabase) as Promise<RawRow[]>,
        fetchUserLimit().then(setLimit),
      ])
      setSetlists(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          service_date: row.service_date,
          created_at: row.created_at,
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

  // No mount fetch here: the owning screen's useFocusEffect fires on initial
  // focus too, so fetching here would double the first load.

  // Pass `id` to create with a client-minted UUID (optimistic: navigate first,
  // let this INSERT land in the background).
  const create = useCallback(async (opts?: { name?: string; id?: string }) => {
    const row = (await createSetlist(supabase, opts ?? {})) as {
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

  // Delete several sets at once (the limit-reached prune flow). Deletes run
  // concurrently; local state drops the ids in one update once all resolve.
  const removeMany = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteSetlist(supabase, id)))
    const gone = new Set(ids)
    setSetlists((prev) => prev.filter((s) => !gone.has(s.id)))
  }, [])

  return {
    setlists,
    loading,
    error,
    refresh,
    create,
    remove,
    removeMany,
    limit,
    atLimit: Number.isFinite(limit) && setlists.length >= limit,
  }
}

// Read the current user's role from public.users and map it to their personal
// setlist cap. Falls back to the base `user` cap if unauthenticated or the read
// fails — the DB trigger remains the real gate, so a lenient default only risks
// one extra blocked insert, never an over-cap save.
async function fetchUserLimit(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return personalSetlistLimit('user')
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return personalSetlistLimit('user')
  return personalSetlistLimit((data as { role?: string }).role)
}
