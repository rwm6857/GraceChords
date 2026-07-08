import { useCallback, useEffect, useState } from 'react'
import { fetchSongList, fetchPersonalSongs } from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

// Shape of a song row as the Library needs it. The base fetchSongList selects
// only id/slug/title/artist/default_key, so we widen the column list to also
// pull time_signature, tags, tempo and created_at for the row meta, tag filter,
// and the Recently-added / Tempo sorts.
//
// The library merges two sources: the public catalog (`songs`) and the signed-in
// user's own personal drafts (`personal_songs`, owner-scoped by RLS). Personal
// rows carry `source: 'personal'`, a `personalId`, and `reviewStatus` so the row
// can show Personal/Pending badges and open the viewer against the right table.
export type SongSource = 'catalog' | 'personal'

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
  /** 'catalog' (default when omitted) or 'personal'. */
  source?: SongSource
  /** personal_songs.id when source === 'personal'. */
  personalId?: string
  /** personal_songs.status ('draft' | 'submitted' | 'published' | 'archived'). */
  reviewStatus?: string
}

const COLUMNS =
  'id, slug, title, artist, default_key, time_signature, tags, tempo, created_at'

type CatalogRow = Omit<Song, 'source' | 'personalId' | 'reviewStatus'>
type PersonalRow = {
  id: string
  slug: string | null
  title: string
  artist: string | null
  default_key: string | null
  time_signature: string | null
  tags: string[] | null
  tempo: number | null
  status: string
  published_song_id: string | null
  created_at: string | null
}

function personalToSong(row: PersonalRow): Song {
  return {
    id: `personal:${row.id}`,
    slug: row.slug ?? '',
    title: row.title,
    artist: row.artist,
    default_key: row.default_key,
    time_signature: row.time_signature,
    tags: row.tags,
    tempo: row.tempo,
    created_at: row.created_at,
    source: 'personal',
    personalId: row.id,
    reviewStatus: row.status,
  }
}

// Fetch the public catalog and the user's personal drafts and merge them. A
// personal draft that has already been published (published_song_id set) is
// hidden — its catalog twin already appears.
export function useSongList() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetchSongList(supabase, { columns: COLUMNS }) as unknown as Promise<CatalogRow[]>,
      // Personal songs are best-effort: signed-out users just get [].
      (fetchPersonalSongs(supabase) as unknown as Promise<PersonalRow[]>).catch(
        () => [] as PersonalRow[],
      ),
    ])
      .then(([catalog, personal]) => {
        if (!alive) return
        const catalogSongs: Song[] = catalog.map((r) => ({ ...r, source: 'catalog' as const }))
        const personalSongs: Song[] = personal
          .filter((r) => !r.published_song_id)
          .map(personalToSong)
        setSongs([...personalSongs, ...catalogSongs])
        setError(null)
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

  useEffect(() => load(), [load])

  return { songs, loading, error, reload: load }
}
