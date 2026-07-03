import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { errMessage } from './errors'
import type { Song } from './useSongList'

// The fields the Home "Starred songs" rows need. A subset of the full Song.
export type StarredSong = Pick<
  Song,
  'id' | 'slug' | 'title' | 'artist' | 'default_key' | 'time_signature'
>

const SONG_COLUMNS = 'id, slug, title, artist, default_key, time_signature'

// Read the current user's starred songs. Two steps rather than a PostgREST embed
// (`songs!inner(...)`): first the star rows, then the songs by id. This avoids any
// relationship-embedding ambiguity and reuses the plain songs select.
// `user_starred_songs.song_id` is a uuid FK to `songs.id`; RLS scopes the star read
// to the signed-in user. Ordered by song title (A–Z) to match the web Profile page —
// the table has no timestamp column to sort by recency. Read-only — starring/
// unstarring is a later feature.
export function useStarredSongs() {
  const [songs, setSongs] = useState<StarredSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const uid = sessionData.session?.user?.id
        if (!uid) {
          if (alive) {
            setSongs([])
            setError(null)
          }
          return
        }

        const { data: stars, error: starsErr } = await supabase
          .from('user_starred_songs')
          .select('song_id')
          .eq('user_id', uid)
        if (starsErr) throw starsErr

        const ids = (stars ?? []).map((r: { song_id: string }) => r.song_id)
        if (ids.length === 0) {
          if (alive) {
            setSongs([])
            setError(null)
          }
          return
        }

        const { data: rows, error: songsErr } = await supabase
          .from('songs')
          .select(SONG_COLUMNS)
          .in('id', ids)
          .eq('is_deleted', false)
          .order('title', { ascending: true })
        if (songsErr) throw songsErr

        if (alive) {
          setSongs((rows ?? []) as StarredSong[])
          setError(null)
        }
      } catch (err: unknown) {
        if (alive) setError(errMessage(err))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return { songs, loading, error }
}
