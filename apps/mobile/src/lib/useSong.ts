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

// Process-lifetime cache of fetched song bodies, keyed by slug. Lets the
// performer prefetch the whole set so page turns are instant. Cleared only on
// reload — song bodies are effectively immutable within a session.
const songCache = new Map<string, SongDetail | null>()

// Fetch (and cache) one song by slug. Safe to call ahead of need; concurrent
// prefetches for the same slug dedupe on the in-flight promise.
const inFlight = new Map<string, Promise<SongDetail | null>>()
export function prefetchSong(slug: string | undefined): void {
  if (!slug || songCache.has(slug) || inFlight.has(slug)) return
  const p = fetchSongBySlug(supabase, slug)
    .then((row: unknown) => {
      const detail = (row as SongDetail | null) ?? null
      songCache.set(slug, detail)
      return detail
    })
    .catch(() => null)
    .finally(() => inFlight.delete(slug))
  inFlight.set(slug, p)
}

// Fetch one song by slug via the shared core query layer. Cache-first: a
// prefetched (or previously viewed) song renders instantly. A missing row
// resolves to song === null with no error — the screen treats that as not found.
export function useSong(slug: string | undefined) {
  const cached = slug ? songCache.get(slug) : undefined
  const [song, setSong] = useState<SongDetail | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }
    // Cache hit → render immediately, no fetch.
    if (songCache.has(slug)) {
      setSong(songCache.get(slug) ?? null)
      setError(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetchSongBySlug(supabase, slug)
      .then((row: unknown) => {
        const detail = (row as SongDetail | null) ?? null
        songCache.set(slug, detail)
        if (alive) {
          setSong(detail)
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
