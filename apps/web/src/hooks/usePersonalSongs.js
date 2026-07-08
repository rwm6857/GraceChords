// usePersonalSongs — the current user's personal (unpublished) songs, for the
// web library. Owner-scoped by RLS, so signed-out users simply get []. Kept
// separate from the global useSongs catalog (which is shared app-wide) so
// per-user drafts never leak into the setlist builder / song view / export
// paths that read that cache.

import { useEffect, useState } from 'react'
import { fetchPersonalSongs } from '@gracechords/core'
import { supabase } from '../lib/supabase'

export function usePersonalSongs() {
  const [personalSongs, setPersonalSongs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetchPersonalSongs(supabase)
      .then((rows) => {
        if (alive) setPersonalSongs(rows || [])
      })
      .catch(() => {
        if (alive) setPersonalSongs([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { personalSongs, loading }
}
