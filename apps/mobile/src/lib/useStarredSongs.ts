import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Song } from './useSongList'

// The fields the Home "Starred songs" rows need. A subset of the full Song.
export type StarredSong = Pick<
  Song,
  'id' | 'slug' | 'title' | 'artist' | 'default_key' | 'time_signature'
>

// The current schema (20260305_songs_migration.sql) stores
// user_starred_songs.song_id as a uuid FK to songs.id, so one embedded select
// returns each starred song's metadata directly, newest star first. RLS already
// scopes the read to the signed-in user; we also pass the explicit user_id
// filter (mirrors the web's ProfilePage query) and to short-circuit when signed
// out. Read-only: starring/unstarring is a later feature.
const STAR_SELECT =
  'songs!inner(id, slug, title, artist, default_key, time_signature)'

// Supabase types an embedded relation as either an object or an array depending
// on inference; normalize both.
function pickSong(row: { songs: StarredSong | StarredSong[] }): StarredSong | null {
  const s = Array.isArray(row.songs) ? row.songs[0] : row.songs
  return s ?? null
}

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
        const { data, error: qErr } = await supabase
          .from('user_starred_songs')
          .select(STAR_SELECT)
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
        if (qErr) throw qErr
        const rows = (data ?? []) as unknown as { songs: StarredSong | StarredSong[] }[]
        const mapped = rows.map(pickSong).filter((s): s is StarredSong => s != null)
        if (alive) {
          setSongs(mapped)
          setError(null)
        }
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : String(err))
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
