// Working state + persistence for one saved (Supabase) setlist.
//
// Ported from apps/mobile/src/lib/useSetlistBuilder.ts so both clients behave
// identically: every mutation updates local state immediately and schedules a
// debounced wipe-and-replace save through core's setlistsRepo (position is the
// array index, so one write path covers reorder / remove / duplicate / key
// change / rename alike). Saves are serialized — while one is in flight at
// most one trailing save is queued — and pending work is flushed when the tab
// is hidden or the hook unmounts.
//
// KNOWN LIMITATION, matching mobile: updateSetlist deletes every setlist_songs
// row and re-inserts it, so two clients open on the same setlist clobber each
// other wholesale rather than merging. Last debounce wins. The gates below
// only protect against a single client racing its own initial load.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteSetlist as repoDeleteSetlist,
  fetchSetlist,
  updateSetlist,
} from '@gracechords/core'
import { supabase } from '../lib/supabase'
import { useSongs } from './useSongs'
import { buildSongCatalog } from '../utils/songs/songCatalog'
import { entrySongFromCatalog, makeEntryKey, toWorkingItems } from '../utils/setlists/entries'

const SAVE_DEBOUNCE_MS = 800
const LOAD_RETRY_MS = 400
const LOAD_MAX_RETRIES = 4 // ~1.6s — covers an optimistic create still inserting

/**
 * @param {string} setlistId
 * @returns {import('../utils/setlists/entries').SetlistController}
 */
export function useSetlistBuilder(setlistId) {
  // The catalog is only needed for the Add-songs rail; existing rows render
  // from the song data core embeds in the setlist fetch, so the screen is NOT
  // gated on the catalog load.
  const { songs, loading: songsLoading } = useSongs()
  const catalog = useMemo(() => buildSongCatalog(songs), [songs])

  const [name, setNameState] = useState('')
  const [entries, setEntries] = useState([])
  const [serviceDate, setServiceDate] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // A load that FAILED (network/timeout), as opposed to one that returned no
  // row. Tracked separately because the two must not be treated alike: a
  // missing row is a dead end, but a failed load leaves working state that only
  // LOOKS empty, and saving from it would overwrite the real setlist.
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  // Latest state for the save path (timers would otherwise close over stale values).
  const latest = useRef({ name: '', serviceDate: null, entries: [] })
  latest.current = { name, serviceDate, entries }

  const timer = useRef(null)
  const inFlight = useRef(false)
  const trailing = useRef(false)
  const deleted = useRef(false)
  const hydrated = useRef(false)
  const unmounted = useRef(false)

  const runSave = useCallback(async () => {
    if (deleted.current || !setlistId) return
    if (!hydrated.current) {
      // An edit landed before the initial load resolved — defer rather than
      // drop it, so nothing written could clobber entries not yet fetched.
      //
      // Not re-armed after unmount: the unmount flush runs this, and a load
      // that never succeeds would otherwise leave a timer rescheduling itself
      // for the life of the page.
      if (!timer.current && !unmounted.current) {
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
    if (!unmounted.current) setSaving(true)
    try {
      const { name: n, serviceDate: d, entries: e } = latest.current
      await updateSetlist(supabase, setlistId, {
        name: n,
        serviceDate: d,
        songs: e.map((item) => ({ id: item.songId, toKey: item.toKey })),
      })
      if (!unmounted.current) {
        setSaveFailed(false)
        setUpdatedAt(new Date().toISOString())
      }
    } catch (err) {
      // A SAVE failure, not a load failure — the user is mid-edit and needs to
      // know their work is not persisted. The debounced save retries on the
      // next edit (and on flush), so the UI says "not saved" rather than
      // offering a button.
      console.error('[useSetlistBuilder] save:', err)
      if (!unmounted.current) setSaveFailed(true)
    } finally {
      inFlight.current = false
      if (!unmounted.current) setSaving(false)
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
  // still in flight) can come back empty for a moment, so retry a few times
  // before declaring it missing.
  useEffect(() => {
    let alive = true
    let attempt = 0
    let retry = null
    setLoadFailed(false)
    setNotFound(false)
    // No setlist selected: the workspace still mounts this hook so hook order
    // stays stable across routes, but there is nothing to fetch.
    if (!setlistId) {
      setNameState('')
      setEntries([])
      setLoading(false)
      return () => {}
    }
    setLoading(true)

    const load = () => {
      fetchSetlist(supabase, setlistId)
        .then((data) => {
          if (!alive) return
          if (!data) {
            if (attempt < LOAD_MAX_RETRIES) {
              attempt += 1
              retry = setTimeout(load, LOAD_RETRY_MS)
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
            }))
          )
          setLoadFailed(false)
          setSaveFailed(false)
          setLoading(false)
        })
        .catch((err) => {
          if (!alive) return
          console.error('[useSetlistBuilder] load:', err)
          setLoadFailed(true)
          setLoading(false)
        })
    }
    load()
    return () => {
      alive = false
      if (retry) clearTimeout(retry)
    }
  }, [setlistId, reloadNonce])

  // Only allow saves once the initial load has SUCCEEDED, so an early rename
  // can't wipe entries that haven't been fetched yet.
  //
  // `loadFailed` is part of this condition and must stay: without it a failed
  // load (offline, or a request that timed out) also cleared `loading`,
  // hydration flipped on regardless, and the working state it hydrated from was
  // the INITIAL one — empty name, no entries. The next edit then saved that,
  // and wipe-and-replace renamed the setlist to "Untitled Set" and deleted
  // every song in it. An effect rather than a line in the load's success branch
  // because it must run after the state it depends on has committed.
  useEffect(() => {
    if (!loading && !notFound && !loadFailed && !hydrated.current) hydrated.current = true
  }, [loading, notFound, loadFailed])

  // Reset the per-setlist refs when the hook is pointed at a different set,
  // or a set opened after a delete would refuse to save.
  useEffect(() => {
    hydrated.current = false
    deleted.current = false
    trailing.current = false
  }, [setlistId])

  // Flush pending edits when the tab is hidden or the page goes away.
  // visibilitychange is the reliable one on mobile Safari, where pagehide can
  // be the last event a backgrounded tab ever sees.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushSave()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushSave)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushSave)
      // Marked BEFORE the flush, not after: a pending save still runs (the
      // hydrated path doesn't consult this), but an UNhydrated one must not
      // re-arm its deferral timer on the way out.
      unmounted.current = true
      flushSave()
    }
  }, [flushSave])

  const items = useMemo(() => toWorkingItems(entries, catalog), [entries, catalog])

  const retryLoad = useCallback(() => setReloadNonce((n) => n + 1), [])

  const setName = useCallback(
    (next) => {
      setNameState(next)
      scheduleSave()
    },
    [scheduleSave]
  )

  const setDate = useCallback(
    (next) => {
      setServiceDate(next || null)
      scheduleSave()
    },
    [scheduleSave]
  )

  const toggleSong = useCallback(
    (song) => {
      setEntries((prev) => {
        // Untoggling removes only the LAST entry for that song, so duplicates
        // created on purpose (a reprise) aren't wiped in one click.
        const last = prev.map((e) => e.songId).lastIndexOf(song.dbId)
        if (last >= 0) return prev.filter((_, i) => i !== last)
        return [
          ...prev,
          {
            entryKey: makeEntryKey(song.dbId),
            songId: song.dbId,
            toKey: null,
            song: entrySongFromCatalog(song),
          },
        ]
      })
      scheduleSave()
    },
    [scheduleSave]
  )

  const addVerse = useCallback(
    (verseId) => {
      setEntries((prev) => [
        ...prev,
        { entryKey: makeEntryKey(verseId), songId: verseId, toKey: null, song: null },
      ])
      scheduleSave()
    },
    [scheduleSave]
  )

  const removeEntry = useCallback(
    (entryKey) => {
      setEntries((prev) => prev.filter((e) => e.entryKey !== entryKey))
      scheduleSave()
    },
    [scheduleSave]
  )

  const duplicateEntry = useCallback(
    (entryKey) => {
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
    [scheduleSave]
  )

  const moveEntry = useCallback(
    (fromKey, toEntryKey) => {
      setEntries((prev) => {
        const from = prev.findIndex((e) => e.entryKey === fromKey)
        const to = prev.findIndex((e) => e.entryKey === toEntryKey)
        if (from < 0 || to < 0 || from === to) return prev
        const next = prev.slice()
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
      scheduleSave()
    },
    [scheduleSave]
  )

  const setKeyFor = useCallback(
    (entryKey, key) => {
      setEntries((prev) => prev.map((e) => (e.entryKey === entryKey ? { ...e, toKey: key } : e)))
      scheduleSave()
    },
    [scheduleSave]
  )

  const replaceEntries = useCallback(
    (next) => {
      setEntries(
        next.map((e) => ({
          entryKey: makeEntryKey(e.songId),
          songId: e.songId,
          toKey: e.toKey || null,
          song: e.song || null,
        }))
      )
      scheduleSave()
    },
    [scheduleSave]
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
    persisted: true,
    setlistId,
    name,
    serviceDate,
    items,
    songs,
    songsLoading,
    catalog,
    updatedAt,
    // Gated on the setlist fetch only — rows render from the embedded song
    // data, so the whole-catalog load never blocks the screen.
    loading,
    notFound,
    loadFailed,
    saveFailed,
    saving,
    retryLoad,
    setName,
    setDate,
    toggleSong,
    addVerse,
    removeEntry,
    duplicateEntry,
    moveEntry,
    setKeyFor,
    replaceEntries,
    deleteSet,
  }
}
