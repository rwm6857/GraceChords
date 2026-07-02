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

// One working entry in the builder. `entryKey` is a local list key that stays
// stable across reorders (the DB row ids are wiped on every save, so they
// can't key the list). `toKey` is the setlist-scoped key override
// (setlist_songs.key_override); null means "play in the song's native key".
export type SetlistItem = {
  entryKey: string
  songId: string
  toKey: string | null
  song: Song
}

const SAVE_DEBOUNCE_MS = 800

type RawEntry = { song_id: string; toKey: string | null }

// Working state + persistence for one setlist. Every mutation updates local
// state immediately and schedules a debounced wipe-and-replace save (the web
// updateSetlist semantics — position is the array index, so one write path
// covers reorder / remove / duplicate / key change / rename). Saves are
// serialized: while one is in flight at most one trailing save is queued, and
// pending work is flushed when the app backgrounds or the screen unmounts.
export function useSetlistBuilder(setlistId: string) {
  const { songs, loading: songsLoading, error: songsError } = useSongList()
  const [name, setNameState] = useState('')
  const [entries, setEntries] = useState<Array<{ entryKey: string; songId: string; toKey: string | null }>>([])
  const [serviceDate, setServiceDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
    if (deleted.current || !hydrated.current) return
    if (inFlight.current) {
      trailing.current = true
      return
    }
    inFlight.current = true
    setSaving(true)
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
      setSaving(false)
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

  // Load the setlist once.
  useEffect(() => {
    let alive = true
    fetchSetlist(supabase, setlistId)
      .then((data: Awaited<ReturnType<typeof fetchSetlist>>) => {
        if (!alive) return
        if (!data) {
          setNotFound(true)
          return
        }
        setNameState(data.name)
        setServiceDate(data.service_date)
        setEntries(
          data.entries.map((entry: RawEntry) => ({
            entryKey: makeEntryKey(entry.song_id),
            songId: entry.song_id,
            toKey: entry.toKey,
          })),
        )
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

  // Entries hydrated against the song catalog. Entries whose song no longer
  // exists (deleted since) are dropped from the working state once, at
  // hydration, so list indexes always match what's rendered.
  useEffect(() => {
    if (songsLoading || songs.length === 0) return
    setEntries((prev) => {
      const kept = prev.filter((e) => songsById.has(e.songId))
      return kept.length === prev.length ? prev : kept
    })
  }, [songsLoading, songs.length, songsById])

  const items: SetlistItem[] = useMemo(
    () =>
      entries
        .map((entry) => {
          const song = songsById.get(entry.songId)
          return song ? { ...entry, song } : null
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
        const has = prev.some((e) => e.songId === song.id)
        if (has) return prev.filter((e) => e.songId !== song.id)
        return [...prev, { entryKey: makeEntryKey(song.id), songId: song.id, toKey: null }]
      })
      scheduleSave()
    },
    [makeEntryKey, scheduleSave],
  )

  const removeAt = useCallback(
    (index: number) => {
      setEntries((prev) => prev.filter((_, i) => i !== index))
      scheduleSave()
    },
    [scheduleSave],
  )

  const duplicateAt = useCallback(
    (index: number) => {
      setEntries((prev) => {
        const src = prev[index]
        if (!src) return prev
        const copy = { ...src, entryKey: makeEntryKey(src.songId) }
        const next = prev.slice()
        next.splice(index + 1, 0, copy)
        return next
      })
      scheduleSave()
    },
    [makeEntryKey, scheduleSave],
  )

  const moveItem = useCallback(
    (from: number, to: number) => {
      setEntries((prev) => {
        if (from === to || from < 0 || from >= prev.length) return prev
        const bounded = Math.max(0, Math.min(prev.length - 1, to))
        const next = prev.slice()
        const [moved] = next.splice(from, 1)
        next.splice(bounded, 0, moved)
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  const setKeyAt = useCallback(
    (index: number, key: string | null) => {
      setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, toKey: key } : e)))
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
    loading: loading || songsLoading,
    notFound,
    saving,
    error: error ?? songsError,
    setName,
    toggleSong,
    removeAt,
    duplicateAt,
    moveItem,
    setKeyAt,
    deleteSet,
  }
}
