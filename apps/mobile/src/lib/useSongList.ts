import { useEffect, useState } from 'react'
import { fetchSongList } from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

// Shape of a song row as the Library needs it. The base fetchSongList selects
// only id/slug/title/artist/default_key, so we widen the column list to also
// pull time_signature, tags, tempo and created_at for the row meta, tag filter,
// and the Recently-added / Tempo sorts.
export type Song = {
  id: string
  slug: string
  title: string
  artist: string | null
  default_key: string | null
  time_signature: string | null
  tags: string[] | null
  tempo: number | null
  created_at: string | null
}

const COLUMNS =
  'id, slug, title, artist, default_key, time_signature, tags, tempo, created_at'

// Fetch the real song list from Supabase via the shared core query layer. Mirrors
// the simple loading/error/data pattern already used in the app (no React Query).
export function useSongList() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchSongList(supabase, { columns: COLUMNS })
      .then((rows: unknown) => {
        if (alive) {
          setSongs(rows as Song[])
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(errMessage(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return { songs, loading, error }
}
