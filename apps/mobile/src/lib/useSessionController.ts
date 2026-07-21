import { useCallback, useEffect, useRef, useState } from 'react'
import { Share } from 'react-native'
import {
  buildSnapshot,
  createSession,
  endSession as repoEndSession,
  fetchActiveSessionForController,
  touchSession,
  updateCurrentItem,
} from '@gracechords/core'
import { supabase } from './supabase'
import { buildSessionShareUrl } from './setlistShare'

// Coalesce rapid leader changes (transpose taps, a song change that re-settles
// once its chart body loads) into one write, and keep a quiet session alive so
// the cleanup TTL doesn't reap it mid-set.
const BROADCAST_DEBOUNCE_MS = 250
const HEARTBEAT_MS = 60_000

export type ActiveSession = { id: string; code: string; chordCode: string | null }

type SnapshotEntry = {
  songId: string
  toKey?: string | null
  song?: { slug?: string; title?: string; default_key?: string | null } | null
}
type BroadcastState = { itemUid: string; transpose: number; currentKey: string | null }

// Leader-side controller for a live Session. Owns the session row's lifecycle
// (create / broadcast / heartbeat / end) and adopts an already-running session
// for this setlist so leaving and reopening the Performer — or relaunching the
// app — resumes broadcasting instead of orphaning the row.
export function useSessionController(setlistId: string) {
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [busy, setBusy] = useState(false)

  const sessionRef = useRef<ActiveSession | null>(null)
  sessionRef.current = session
  const lastSent = useRef<string>('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adopt an existing live session owned by this user for THIS setlist.
  useEffect(() => {
    let alive = true
    fetchActiveSessionForController(supabase)
      .then((row) => {
        if (!alive || !row) return
        if (row.setlist_id === setlistId) {
          setSession({ id: row.id, code: row.code, chordCode: row.chord_code ?? null })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [setlistId])

  // Heartbeat while live.
  useEffect(() => {
    if (!session) return
    const id = setInterval(() => {
      touchSession(supabase, session.id).catch(() => {})
    }, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [session])

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current)
    },
    [],
  )

  const start = useCallback(
    async (entries: SnapshotEntry[]) => {
      if (sessionRef.current || busy) return
      setBusy(true)
      try {
        const items = buildSnapshot(entries)
        const row = await createSession(supabase, { setlistId, items })
        setSession({ id: row.id, code: row.code, chordCode: row.chord_code ?? null })
        // Don't auto-open the share sheet here; the Performer surfaces the
        // share menu (team / participant link) once the session is live.
      } finally {
        setBusy(false)
      }
    },
    [busy, setlistId],
  )

  const reshareLyrics = useCallback(async () => {
    const s = sessionRef.current
    if (!s) return
    await Share.share({ message: buildSessionShareUrl(s.code) }).catch(() => {})
  }, [])

  const reshareChords = useCallback(async () => {
    const s = sessionRef.current
    if (!s || !s.chordCode) return
    await Share.share({ message: buildSessionShareUrl(s.chordCode) }).catch(() => {})
  }, [])

  const end = useCallback(async () => {
    const s = sessionRef.current
    if (!s) return
    setBusy(true)
    try {
      await repoEndSession(supabase, s.id)
    } finally {
      setSession(null)
      lastSent.current = ''
      setBusy(false)
    }
  }, [])

  // Debounced, de-duplicated broadcast of the current item + transpose. Safe to
  // call every render; it no-ops when there's no live session or nothing changed.
  const broadcast = useCallback((state: BroadcastState) => {
    const s = sessionRef.current
    if (!s) return
    const key = `${state.itemUid}|${state.transpose}|${state.currentKey ?? ''}`
    if (key === lastSent.current) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      lastSent.current = key
      updateCurrentItem(supabase, s.id, {
        itemUid: state.itemUid,
        transpose: state.transpose,
        currentKey: state.currentKey,
      }).catch(() => {})
    }, BROADCAST_DEBOUNCE_MS)
  }, [])

  return { session, busy, start, reshareLyrics, reshareChords, end, broadcast }
}
