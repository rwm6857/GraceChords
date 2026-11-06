/**
 * useSongs — fetches the full song list from Supabase and normalises the rows
 * into the same shape that components previously read from src/data/index.json.
 *
 * Extra fields added by the DB:
 *   dbId          — UUID primary key (used for starring and setlist entries)
 *   star_count    — integer, maintained by DB trigger
 *   chordpro_content — full renderable body (metadata directives stripped).
 *                      NOT part of the list query: lyrics are ~85% of the
 *                      payload, so they are fetched per song on demand. It is
 *                      undefined until loaded; read it with songContent() after
 *                      ensureSongContent() / useSongContent().
 *
 * Uses a stale-while-revalidate strategy: cached data is served immediately,
 * but after STALE_MS a background refetch runs and all mounted hook instances
 * are updated without requiring a hard refresh.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STALE_MS = 5 * 60 * 1000  // revalidate after 5 minutes

let _cache = null
let _promise = null
let _cacheTime = 0
const _listeners = new Set()

// Lyrics, kept apart from the list so a stale-while-revalidate refetch of the
// list doesn't throw away content that has already been loaded.
const _content = new Map()   // dbId -> chordpro_content
const _contentPending = new Map()   // dbId -> in-flight promise
// Above this many missing songs, one unfiltered request beats a long `in` list.
const BULK_CONTENT_THRESHOLD = 40

async function fetchSongs() {
  if (_promise) return _promise
  _promise = supabase
    .from('songs')
    .select(
      'id, slug, title, artist, default_key, tempo, time_signature, tags, ' +
      'country, youtube_id, source_filename, star_count, ' +
      'song_group_id, is_deleted, has_stems, stem_slug, gracetracks_url'
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
    // Setlist rows show these in their own columns and core's summarizeSet
    // derives the set's BPM range from them.
    tempo: song.tempo ?? null,
    timeSignature: song.time_signature || '',
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

    // Lyrics: undefined until fetched on demand (see ensureSongContent).
    chordpro_content: _content.get(song.id),

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

function storeContent(rows) {
  for (const row of rows || []) _content.set(row.id, row.chordpro_content || '')
}

// Push loaded lyrics into the cached list so every mounted useSongs() re-renders.
function publishContent() {
  if (!_cache) return
  let changed = false
  const next = _cache.map(s => {
    if (s.chordpro_content !== undefined || !_content.has(s.dbId)) return s
    changed = true
    return { ...s, chordpro_content: _content.get(s.dbId) }
  })
  if (!changed) return
  _cache = next
  _listeners.forEach(fn => fn(next))
}

function trackPending(ids, promise) {
  const settled = promise.finally(() => ids.forEach(id => _contentPending.delete(id)))
  ids.forEach(id => _contentPending.set(id, settled))
  return settled
}

/** The song's ChordPro body, or '' when it hasn't been loaded (yet). */
export function songContent(song) {
  if (!song) return ''
  if (typeof song.chordpro_content === 'string') return song.chordpro_content
  return _content.get(song.dbId) ?? ''
}

export function hasSongContent(song) {
  return !!song && (typeof song.chordpro_content === 'string' || _content.has(song.dbId))
}

/**
 * Make sure the lyrics for `songs` (normalised songs, or anything with a
 * `dbId`) are loaded. Resolves once they are; read them with songContent().
 * Failures are logged and leave those songs empty rather than throwing.
 */
export async function ensureSongContent(songs) {
  const ids = [...new Set((songs || []).filter(s => s && !hasSongContent(s)).map(s => s.dbId).filter(Boolean))]
  const missing = ids.filter(id => !_contentPending.has(id))
  if (missing.length) {
    let query = supabase.from('songs').select('id, chordpro_content')
    query = missing.length > BULK_CONTENT_THRESHOLD
      ? query.eq('is_deleted', false)
      : query.in('id', missing)
    trackPending(missing, query.then(({ data, error }) => {
      if (error) throw error
      storeContent(data)
      // A song deleted since the list loaded comes back missing; settle it as
      // empty so nothing waits on it forever.
      missing.forEach(id => { if (!_content.has(id)) _content.set(id, '') })
      publishContent()
    })).catch(err => console.error('[useSongs] Failed to load song content:', err))
  }
  await Promise.all(ids.map(id => _contentPending.get(id)).filter(Boolean)).catch(() => {})
}

/**
 * Start loading one song's lyrics by slug, before the song list has arrived
 * (the song page knows its slug from the URL). No-op once loaded.
 */
export function prefetchSongContentBySlug(slug) {
  if (!slug) return Promise.resolve()
  const key = `slug:${slug}`
  if (_contentPending.has(key)) return _contentPending.get(key)
  const known = _cache?.find(s => s.id === slug)
  if (known && _content.has(known.dbId)) return Promise.resolve()
  return trackPending([key], supabase
    .from('songs')
    .select('id, chordpro_content')
    .eq('slug', slug)
    .eq('is_deleted', false)
    .then(({ data, error }) => {
      if (error) throw error
      storeContent(data)
      publishContent()
    })
  ).catch(err => console.error('[useSongs] Failed to prefetch song content:', err))
}

/**
 * Hook: load lyrics for `songs` and report whether they are all available.
 * Re-renders via the useSongs() listeners once they arrive.
 */
export function useSongContent(songs) {
  const list = (songs || []).filter(Boolean)
  const key = list.map(s => s.dbId).join('|')
  const [, bump] = useState(0)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    ensureSongContent(list).then(() => { if (!cancelled) bump(n => n + 1) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return list.every(hasSongContent)
}

/**
 * Hook.  Returns { songs, loading, error, retry }.
 * songs — array of normalised song objects
 * loading — true while the first fetch is in flight
 * error — true when the first fetch failed and there is nothing cached to show
 * retry — re-issues the fetch after an error
 */
export function useSongs() {
  const [songs, setSongs] = useState(_cache || [])
  const [loading, setLoading] = useState(!_cache)
  const [error, setError] = useState(false)

  // _listeners will push the data into this component's state.
  const loadFirst = useCallback(() => {
    setLoading(true)
    setError(false)
    fetchSongs().then(() => {
      setLoading(false)
      setError(!_cache)
    })
  }, [])

  useEffect(() => {
    _listeners.add(setSongs)

    if (!_cache) {
      loadFirst()
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
  }, [loadFirst])

  return { songs, loading, error, retry: loadFirst }
}
