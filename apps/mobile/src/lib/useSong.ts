import { useEffect, useState } from 'react'
import { fetchSongBySlug, fetchPersonalSongById } from '@gracechords/core'
import { supabase } from './supabase'
import { failureDetailKey } from './errors'

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
// performer prefetch the whole set so page turns are instant. Song bodies are
// effectively immutable within a session, so a hit is always safe.
//
// Capped least-recently-used: PerformerScreen and SessionFollowerScreen each
// bulk-prefetch a whole setlist into this map, so a long session across several
// sets used to accumulate every song body it had ever seen. Every read path is
// cache-first with a network fallback, so eviction only costs a re-fetch. Same
// shape as the cap in src/lib/recents.ts.
const MAX_CACHED_SONGS = 60
const songCache = new Map<string, SongDetail | null>()

/** Read through the cache, refreshing recency so the cap evicts the coldest. */
function readSongCache(slug: string): { hit: true; value: SongDetail | null } | { hit: false } {
  if (!songCache.has(slug)) return { hit: false }
  const value = songCache.get(slug) ?? null
  songCache.delete(slug)
  songCache.set(slug, value)
  return { hit: true, value }
}

function writeSongCache(slug: string, value: SongDetail | null): void {
  songCache.delete(slug)
  songCache.set(slug, value)
  for (const stale of [...songCache.keys()].slice(0, Math.max(0, songCache.size - MAX_CACHED_SONGS))) {
    songCache.delete(stale)
  }
}

// Fetch (and cache) one song by slug. Safe to call ahead of need; concurrent
// prefetches for the same slug dedupe on the in-flight promise.
const inFlight = new Map<string, Promise<SongDetail | null>>()
export function prefetchSong(slug: string | undefined): void {
  if (!slug || songCache.has(slug) || inFlight.has(slug)) return
  const p = fetchSongBySlug(supabase, slug)
    .then((row: unknown) => {
      const detail = (row as SongDetail | null) ?? null
      writeSongCache(slug, detail)
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
  const cached = slug ? readSongCache(slug) : { hit: false as const }
  const [song, setSong] = useState<SongDetail | null>(cached.hit ? cached.value : null)
  const [loading, setLoading] = useState(!cached.hit)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }
    // Cache hit → render immediately, no fetch.
    const hit = readSongCache(slug)
    if (hit.hit) {
      setSong(hit.value)
      setError(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetchSongBySlug(supabase, slug)
      .then((row: unknown) => {
        const detail = (row as SongDetail | null) ?? null
        writeSongCache(slug, detail)
        if (alive) {
          setSong(detail)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        // An i18n KEY, not raw error text. The Viewer renders this as the detail
        // line under its localized "Couldn't load song" heading, so raw Supabase
        // text (or a request-deadline message) used to land in front of the user.
        if (alive) setError(failureDetailKey('useSong', err))
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

// Fetch one of the current user's personal songs by id (owner-scoped via RLS).
// Shape-compatible with SongDetail so the Viewer can render it identically.
// Not cached — drafts change, unlike published bodies.
export function usePersonalSong(id: string | undefined) {
  const [song, setSong] = useState<SongDetail | null>(null)
  const [loading, setLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetchPersonalSongById(supabase, id)
      .then((row: unknown) => {
        if (alive) {
          setSong((row as SongDetail | null) ?? null)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(failureDetailKey('usePersonalSong', err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  return { song, loading, error }
}
