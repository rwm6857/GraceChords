import { useEffect, useState } from 'react'
import { fetchSongBySlug } from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

// Shape of a single song row as the Viewer needs it: the Library metadata plus
// the renderable ChordPro body (which the list query deliberately omits).
export type SongDetail = {
  id: string
  slug: string
  title: string
  artist: string | null
  default_key: string | null
  time_signature: string | null
  tempo: number | null
  chordpro_content: string | null
}

// Fetch one song by slug via the shared core query layer. Mirrors the simple
// loading/error/data pattern of useSongList (no React Query). A missing row
// resolves to song === null with no error — the screen treats that as not found.
export function useSong(slug: string | undefined) {
  const [song, setSong] = useState<SongDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetchSongBySlug(supabase, slug)
      .then((row: unknown) => {
        if (alive) {
          setSong(row as SongDetail | null)
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
  }, [slug])

  return { song, loading, error }
}
