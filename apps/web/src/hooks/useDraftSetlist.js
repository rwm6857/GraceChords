// Working state for an unsaved setlist, persisted to localStorage.
//
// Same controller surface as useSetlistBuilder, so the workspace renders the
// signed-out draft and a saved setlist with one component. There is no debounce
// machinery here: localStorage writes are synchronous, so every mutation
// persists immediately and a refresh or an accidental navigation cannot lose
// work. Nothing reaches Supabase until the user signs in and promotes the
// draft.
//
// Entries are keyed by catalog SLUG rather than uuid. That is the id space the
// shared /setlist/<slugs>?toKeys= links already use, so a draft hydrated from a
// link round-trips without a catalog lookup; toWorkingItems resolves slugs
// through catalog.byId.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSongs } from './useSongs'
import { buildSongCatalog } from '../utils/songs/songCatalog'
import { entrySongFromCatalog, makeEntryKey, toWorkingItems } from '../utils/setlists/entries'

export const DRAFT_STORAGE_KEY = 'gracechords.draft.v1'

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const entries = Array.isArray(parsed.entries) ? parsed.entries : []
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      serviceDate: parsed.serviceDate || null,
      entries: entries
        .filter((e) => e && typeof e.songId === 'string')
        .map((e) => ({
          entryKey: makeEntryKey(e.songId),
          songId: e.songId,
          toKey: e.toKey || null,
          song: null,
        })),
    }
  } catch {
    // Corrupt or unavailable (private mode, blocked storage) — an empty draft
    // beats a page that won't render.
    return null
  }
}

function writeDraft(name, serviceDate, entries) {
  try {
    // An empty draft is stored as no draft at all, so clearing one actually
    // clears it rather than leaving an empty husk behind.
    if (!name && !serviceDate && entries.length === 0) {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      return
    }
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        name,
        serviceDate,
        entries: entries.map((e) => ({ songId: e.songId, toKey: e.toKey })),
      })
    )
  } catch {
    // Storage full or blocked. The in-memory draft still works for this visit.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** @returns {import('../utils/setlists/entries').SetlistController} */
export function useDraftSetlist() {
  const { songs, loading: songsLoading } = useSongs()
  const catalog = useMemo(() => buildSongCatalog(songs), [songs])

  const initial = useRef(null)
  if (initial.current === null) initial.current = readDraft() || { name: '', serviceDate: null, entries: [] }

  const [name, setNameState] = useState(initial.current.name)
  const [serviceDate, setServiceDate] = useState(initial.current.serviceDate)
  const [entries, setEntries] = useState(initial.current.entries)

  // The single writer, so no mutation has to remember to persist.
  useEffect(() => {
    writeDraft(name, serviceDate, entries)
  }, [name, serviceDate, entries])

  const items = useMemo(() => toWorkingItems(entries, catalog), [entries, catalog])

  const toggleSong = useCallback((song) => {
    setEntries((prev) => {
      // Untoggling removes only the LAST entry for that song, so a reprise
      // added on purpose isn't wiped in one click.
      const last = prev.map((e) => e.songId).lastIndexOf(song.id)
      if (last >= 0) return prev.filter((_, i) => i !== last)
      return [
        ...prev,
        {
          entryKey: makeEntryKey(song.id),
          songId: song.id,
          toKey: null,
          song: entrySongFromCatalog(song),
        },
      ]
    })
  }, [])

  const addVerse = useCallback((verseId) => {
    setEntries((prev) => [
      ...prev,
      { entryKey: makeEntryKey(verseId), songId: verseId, toKey: null, song: null },
    ])
  }, [])

  const removeEntry = useCallback((entryKey) => {
    setEntries((prev) => prev.filter((e) => e.entryKey !== entryKey))
  }, [])

  const duplicateEntry = useCallback((entryKey) => {
    setEntries((prev) => {
      const index = prev.findIndex((e) => e.entryKey === entryKey)
      if (index < 0) return prev
      const copy = { ...prev[index], entryKey: makeEntryKey(prev[index].songId) }
      const next = prev.slice()
      next.splice(index + 1, 0, copy)
      return next
    })
  }, [])

  const moveEntry = useCallback((fromKey, toEntryKey) => {
    setEntries((prev) => {
      const from = prev.findIndex((e) => e.entryKey === fromKey)
      const to = prev.findIndex((e) => e.entryKey === toEntryKey)
      if (from < 0 || to < 0 || from === to) return prev
      const next = prev.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const setKeyFor = useCallback((entryKey, key) => {
    setEntries((prev) => prev.map((e) => (e.entryKey === entryKey ? { ...e, toKey: key } : e)))
  }, [])

  const replaceEntries = useCallback((next) => {
    setEntries(
      (next || []).map((e) => ({
        entryKey: makeEntryKey(e.songId),
        songId: e.songId,
        toKey: e.toKey || null,
        song: e.song || null,
      }))
    )
  }, [])

  // Clearing state is enough — the effect above removes the stored draft once
  // it is empty.
  const reset = useCallback(() => {
    setNameState('')
    setServiceDate(null)
    setEntries([])
  }, [])

  return {
    persisted: false,
    setlistId: null,
    name,
    serviceDate,
    items,
    songs,
    songsLoading,
    catalog,
    updatedAt: null,
    loading: false,
    notFound: false,
    loadFailed: false,
    saveFailed: false,
    saving: false,
    retryLoad: () => {},
    setName: setNameState,
    setDate: setServiceDate,
    toggleSong,
    addVerse,
    removeEntry,
    duplicateEntry,
    moveEntry,
    setKeyFor,
    replaceEntries,
    reset,
    deleteSet: async () => {
      clearDraft()
    },
  }
}
