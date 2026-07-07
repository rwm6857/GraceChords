import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  deleteSetlist as repoDeleteSetlist,
  fetchSetlist,
  updateSetlist,
} from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'
import { useSongList, type Song } from './useSongList'

// The song metadata a row needs to render (no chart body / tags). Comes from
// the setlist fetch's embedded song, or from the catalog for songs added this
// session — so rows render without waiting on the whole catalog to load.
export type EntrySong = Pick<
  Song,
  'id' | 'slug' | 'title' | 'artist' | 'default_key' | 'tempo' | 'time_signature'
>

// One working entry in the builder. `entryKey` is a local list key that stays
// stable across reorders (the DB row ids are wiped on every save, so they
// can't key the list). `toKey` is the setlist-scoped key override
// (setlist_songs.key_override); null means "play in the song's native key".
export type SetlistItem = {
  entryKey: string
  songId: string
  toKey: string | null
  song: EntrySong
}

type WorkingEntry = { entryKey: string; songId: string; toKey: string | null; song: EntrySong | null }

const SAVE_DEBOUNCE_MS = 800
const LOAD_RETRY_MS = 400
const LOAD_MAX_RETRIES = 4 // ~1.6s — covers an optimistic create still inserting

function toEntrySong(song: Song): EntrySong {
  return {
    id: song.id,
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    default_key: song.default_key,
    tempo: song.tempo,
    time_signature: song.time_signature,
  }
}

// Working state + persistence for one setlist. Every mutation updates local
// state immediately and schedules a debounced wipe-and-replace save (the web
// updateSetlist semantics — position is the array index, so one write path
// covers reorder / remove / duplicate / key change / rename). Saves are
// serialized: while one is in flight at most one trailing save is queued, and
// pending work is flushed when the app backgrounds or the screen unmounts.
export function useSetlistBuilder(setlistId: string) {
  // The catalog is only needed for the Add-songs search (modal + tablet
  // library pane); existing rows render from the setlist fetch's embedded
  // song data, so we do NOT gate the screen on `songsLoading`.
  const { songs, loading: songsLoading, error: songsError } = useSongList()
  const [name, setNameState] = useState('')
  const [entries, setEntries] = useState<WorkingEntry[]>([])
  const [serviceDate, setServiceDate] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs])

  const nextKey = useRef(0)
  const makeEntryKey = useCallback((songId: string) => `${songId}:${nextKey.current++}`, [])

  // Latest state for the save path (avoids stale closures in timers).
  const latest = useRef({ name: '', serviceDate: null as string | null, entries: [] as Array<{ songId: string; toKey: string | null }> })
  latest.current = { name, serviceDate, entries }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const trailing = useRef(false)
  const deleted = useRef(false)
  const hydrated = useRef(false)

  const runSave = useCallback(async () => {
    if (deleted.current) return
    if (!hydrated.current) {
      // An edit landed before the initial load resolved — defer rather than
      // drop it, so nothing written could clobber entries not yet fetched.
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null
          runSave()
        }, SAVE_DEBOUNCE_MS)
      }
      return
    }
    if (inFlight.current) {
      trailing.current = true
      return
    }
    inFlight.current = true
    try {
      const { name: n, serviceDate: d, entries: e } = latest.current
      await updateSetlist(supabase, setlistId, {
        name: n,
        serviceDate: d,
        songs: e.map((item) => ({ id: item.songId, toKey: item.toKey })),
      })
      setError(null)
    } catch (err: unknown) {
      setError(errMessage(err))
    } finally {
      inFlight.current = false
      if (trailing.current) {
        trailing.current = false
        runSave()
      }
    }
  }, [setlistId])

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      runSave()
    }, SAVE_DEBOUNCE_MS)
  }, [runSave])

  const flushSave = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      runSave()
    }
  }, [runSave])

  // Load the setlist once. A brand-new set opened optimistically (its INSERT
  // still in flight) can 404 for a moment, so retry a few times before
  // declaring it missing.
  useEffect(() => {
    let alive = true
    let attempt = 0
    const load = () => {
      fetchSetlist(supabase, setlistId)
        .then((data: Awaited<ReturnType<typeof fetchSetlist>>) => {
          if (!alive) return
          if (!data) {
            if (attempt < LOAD_MAX_RETRIES) {
              attempt += 1
              setTimeout(load, LOAD_RETRY_MS)
              return
            }
            setNotFound(true)
            setLoading(false)
            return
          }
          setNameState(data.name)
          setServiceDate(data.service_date)
          setUpdatedAt(data.updated_at)
          setEntries(
            data.entries.map((entry) => ({
              entryKey: makeEntryKey(entry.song_id),
              songId: entry.song_id,
              toKey: entry.toKey,
              song: entry.song ? { id: entry.song_id, ...entry.song } : null,
            })),
          )
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (alive) {
            setError(errMessage(err))
            setLoading(false)
          }
        })
    }
    load()
    return () => {
      alive = false
    }
  }, [setlistId, makeEntryKey])

  // Only allow saves once the initial load has landed, so an early rename
  // can't wipe entries that haven't been fetched yet.
  useEffect(() => {
    if (!loading && !notFound && !hydrated.current) hydrated.current = true
  }, [loading, notFound])

  // Flush pending edits when the app backgrounds or the screen unmounts.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushSave()
    })
    return () => {
      sub.remove()
      flushSave()
    }
  }, [flushSave])

  // Entries hydrated against the song catalog. Entries whose song isn't in
  // the catalog (e.g. soft-deleted) are hidden from the UI but KEPT in the
  // working state, so wipe-and-replace saves never silently erase them —
  // which is also why every mutation below is keyed by entryKey, not index:
  // rendered indexes and entry indexes can diverge.
  const items: SetlistItem[] = useMemo(
    () =>
      entries
        .map((entry) => {
          // Prefer the entry's embedded song; fall back to the catalog (e.g.
          // an entry that arrived before its embed, or edge cases).
          const catalog = songsById.get(entry.songId)
          const song = entry.song ?? (catalog ? toEntrySong(catalog) : null)
          return song ? { entryKey: entry.entryKey, songId: entry.songId, toKey: entry.toKey, song } : null
        })
        .filter((item): item is SetlistItem => item != null),
    [entries, songsById],
  )

  const setName = useCallback(
    (next: string) => {
      setNameState(next)
      scheduleSave()
    },
    [scheduleSave],
  )

  const toggleSong = useCallback(
    (song: Song) => {
      setEntries((prev) => {
        // Untoggling removes only the LAST entry for that song, so duplicates
        // created on purpose (a reprise) aren't wiped in one tap.
        const last = prev.map((e) => e.songId).lastIndexOf(song.id)
        if (last >= 0) return prev.filter((_, i) => i !== last)
        return [...prev, { entryKey: makeEntryKey(song.id), songId: song.id, toKey: null, song: toEntrySong(song) }]
      })
      scheduleSave()
    },
    [makeEntryKey, scheduleSave],
  )

  const removeEntry = useCallback(
    (entryKey: string) => {
      setEntries((prev) => prev.filter((e) => e.entryKey !== entryKey))
      scheduleSave()
    },
    [scheduleSave],
  )

  const duplicateEntry = useCallback(
    (entryKey: string) => {
      setEntries((prev) => {
        const index = prev.findIndex((e) => e.entryKey === entryKey)
        if (index < 0) return prev
        const copy = { ...prev[index], entryKey: makeEntryKey(prev[index].songId) }
        const next = prev.slice()
        next.splice(index + 1, 0, copy)
        return next
      })
      scheduleSave()
    },
    [makeEntryKey, scheduleSave],
  )

  const moveEntry = useCallback(
    (fromKey: string, toKey: string) => {
      setEntries((prev) => {
        const from = prev.findIndex((e) => e.entryKey === fromKey)
        const to = prev.findIndex((e) => e.entryKey === toKey)
        if (from < 0 || to < 0 || from === to) return prev
        const next = prev.slice()
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const setKeyFor = useCallback(
    (entryKey: string, key: string | null) => {
      setEntries((prev) => prev.map((e) => (e.entryKey === entryKey ? { ...e, toKey: key } : e)))
      scheduleSave()
    },
    [scheduleSave],
  )

  const deleteSet = useCallback(async () => {
    deleted.current = true
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    await repoDeleteSetlist(supabase, setlistId)
  }, [setlistId])

  return {
    name,
    items,
    songs,
    songsLoading,
    updatedAt,
    // Gated on the setlist fetch only — rows render from embedded song data,
    // so the whole-catalog load never blocks the screen.
    loading,
    notFound,
    error: error ?? songsError,
    setName,
    toggleSong,
    removeEntry,
    duplicateEntry,
    moveEntry,
    setKeyFor,
    deleteSet,
  }
}
