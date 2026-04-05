/**
 * useSongs — fetches the full song list from Supabase and normalises the rows
 * into the same shape that components previously read from src/data/index.json.
 *
 * Extra fields added by the DB:
 *   dbId          — UUID primary key (used for starring)
 *   star_count    — integer, maintained by DB trigger
 *   chordpro_content — full renderable body (metadata directives stripped)
 *
 * The result is module-level cached so subsequent hook calls in the same
 * session do not re-fetch from the network.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Module-level cache so the list is only fetched once per page load.
let _cache = null
let _promise = null

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
        return []
      }
      const normalised = (data || []).map(normaliseSong)
      _cache = normalised
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
    if (_cache) {
      // Already loaded — nothing to do.
      return
    }
    fetchSongs().then(data => {
      setSongs(data)
      setLoading(false)
    })
  }, [])

  return { songs, loading }
}
