/**
 * useSongs — fetches the full song list from Supabase and normalises the rows
 * into the same shape that components previously read from src/data/index.json.
 *
 * Extra fields added by the DB:
 *   dbId          — UUID primary key (used for starring)
 *   star_count    — integer, maintained by DB trigger
 *   chordpro_content — full renderable body (metadata directives stripped)
 *
 * Uses a stale-while-revalidate strategy: cached data is served immediately,
 * but after STALE_MS a background refetch runs and all mounted hook instances
 * are updated without requiring a hard refresh.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STALE_MS = 5 * 60 * 1000  // revalidate after 5 minutes

let _cache = null
let _promise = null
let _cacheTime = 0
const _listeners = new Set()

async function fetchSongs() {
  if (_promise) return _promise
  _promise = supabase
    .from('songs')
    .select(
      'id, slug, title, artist, default_key, tags, country, youtube_id, ' +
      'source_filename, chordpro_content, star_count, song_group_id, is_deleted, ' +
      'has_stems, stem_slug, gracetracks_url'
    )
    .eq('is_deleted', false)
    .order('title')
    .then(({ data, error }) => {
      if (error) {
        console.error('[useSongs] Failed to load songs from Supabase:', error)
        _promise = null // allow retry
        return _cache || []
      }
      const normalised = (data || []).map(normaliseSong)
      _cache = normalised
      _cacheTime = Date.now()
      _listeners.forEach(fn => fn(normalised))
      return normalised
    })
  return _promise
}

/**
 * Map a Supabase songs row to the shape components expect.
 * Field mapping:
 *   id (UUID)       → dbId   (for FK relationships like starring)
 *   slug            → id     (URL routing, backward-compat with slug-based code)
 *   artist (string) → authors (string[])
 *   default_key     → originalKey
 *   youtube_id      → youtube (full URL or empty string)
 *   source_filename → filename (e.g. "10_000_reasons.chordpro")
 */
function normaliseSong(song) {
  return {
    // DB identity
    dbId: song.id,

    // URL / catalog identity (slug-based, backward compatible)
    id: song.slug,
    songId: song.slug,

    // Metadata
    title: song.title,
    language: 'en',  // language will be added when multi-lingual support is wired
    originalKey: song.default_key || '',
    tags: Array.isArray(song.tags) ? song.tags : [],
    authors: song.artist
      ? song.artist.split(/,\s*/).filter(Boolean)
      : [],
    country: song.country || '',

    // Media URLs
    youtube: song.youtube_id
      ? `https://www.youtube.com/watch?v=${song.youtube_id}`
      : null,
    mp3: null,
    pptx: '',

    // Content (from DB — no static-file fetch needed in SongViewPage)
    chordpro_content: song.chordpro_content || '',

    // Source filename for pptx/JPG URL construction (may differ from slug)
    filename: song.source_filename
      ? `${song.source_filename}.chordpro`
      : `${song.slug.replace(/-/g, '_')}.chordpro`,

    // Stats
    star_count: song.star_count || 0,

    // Translation grouping (not yet wired)
    song_group_id: song.song_group_id || null,

    incomplete: false,

    // GraceTracks stem fields
    has_stems:       song.has_stems       ?? false,
    stem_slug:       song.stem_slug       ?? null,
    gracetracks_url: song.gracetracks_url ?? null,
  }
}

/**
 * Hook.  Returns { songs, loading }.
 * songs — array of normalised song objects
 * loading — true while the first fetch is in flight
 */
export function useSongs() {
  const [songs, setSongs] = useState(_cache || [])
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    _listeners.add(setSongs)

    if (!_cache) {
      // First load — fetch and clear loading when done.
      // _listeners will push the data into this component's state.
      fetchSongs().then(() => setLoading(false))
    } else {
      setLoading(false)
      // Stale-while-revalidate: if cached data is older than STALE_MS,
      // clear the cached promise so fetchSongs issues a fresh request.
      // _listeners will push the updated songs to all mounted hook instances.
      if (Date.now() - _cacheTime > STALE_MS) {
        _promise = null
        fetchSongs()
      }
    }

    return () => _listeners.delete(setSongs)
  }, [])

  return { songs, loading }
}
