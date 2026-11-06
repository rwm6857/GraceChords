import { useEffect, useRef } from 'react'
import {
  SONG_STATS_RULES,
  createSongStatsDataSource,
  createSongStatsPreviewStore,
  createSongStatsRecorder,
  saveSongStatsEnabled,
  songStatsEnabledFromPreferences,
} from '@gracechords/core'
import { supabase } from './supabase'

// Song Stats on the web: the one recorder for the tab, plus the hooks that feed
// it. The pages that read it back are in src/features/songStats. The rules,
// buffering and offline queue live in core (packages/core/src/songStats); this
// file connects them to the browser: localStorage, tab visibility, and the
// signed-in user published by AuthProvider.
//
// Signed-out visitors are never recorded — there is no one to attribute a play
// to. Worship Mode and the song page are locked surfaces: these hooks are
// invisible and must never throw into a render.

const storage = {
  async getItem(key) {
    try { return localStorage.getItem(key) } catch { return null }
  },
  async setItem(key, value) {
    try { localStorage.setItem(key, value) } catch { /* quota / private mode: drop */ }
  },
  async removeItem(key) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

function uuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const songStats = createSongStatsRecorder({ client: supabase, storage, uuid })

/** Cached reads for the Song Stats pages; dropped whenever the recorder reports a change. */
export const songStatsData = createSongStatsDataSource({ client: supabase, storage, recorder: songStats })

/** Dev-build / admin preview switches (bypass the gate, sample history). */
export const songStatsPreview = createSongStatsPreviewStore(storage)

let currentUserId = null
let listening = false

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('online', () => { void songStats.flush() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void songStats.flush()
  })
}

/**
 * Called by AuthProvider whenever the session or profile changes. Starts the
 * recorder for a signed-in user (settling a Worship Mode session the tab was
 * closed during, sending anything queued) and caches their opt-out.
 */
export function setSongStatsUser(userId, preferences) {
  const changed = userId !== currentUserId
  currentUserId = userId || null
  if (!currentUserId) {
    if (changed) void songStats.clearLocal()
    return
  }
  if (preferences !== undefined) {
    songStats.setEnabled(currentUserId, songStatsEnabledFromPreferences(preferences))
  }
  if (changed) {
    listen()
    void songStats.start()
  }
}

export function isSongStatsEnabled() {
  return songStats.isEnabled(currentUserId)
}

/** Turn Song Stats on/off for the signed-in account. Throws on failure. */
export async function setSongStatsEnabled(enabled) {
  if (!currentUserId) throw new Error('Not signed in')
  await saveSongStatsEnabled(supabase, currentUserId, enabled)
  songStats.setEnabled(currentUserId, enabled)
}

/** Count one anonymous use of a feature. */
export function countFeatureUse(feature) {
  songStats.countFeature(feature, currentUserId)
  void songStats.flush()
}

/** Count one use of a feature when the calling page mounts. */
export function useFeatureUseOnOpen(feature) {
  useEffect(() => {
    countFeatureUse(feature)
  }, [feature])
}

/**
 * Record a song-page open once the song has stayed on screen (tab visible) for
 * SONG_STATS_RULES.minOpenDisplayMs. The recorder applies the hourly debounce.
 */
export function useSongOpenStats(songId, source = 'catalog') {
  useEffect(() => {
    if (!songId || typeof document === 'undefined') return undefined
    let timer = null
    const arm = () => {
      clearTimeout(timer)
      const openedAt = Date.now()
      timer = setTimeout(() => {
        timer = null
        songStats.recordOpen({ userId: currentUserId, songId, source, openedAt })
      }, SONG_STATS_RULES.minOpenDisplayMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm()
      else { clearTimeout(timer); timer = null }
    }
    if (document.visibilityState !== 'hidden') arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(timer)
    }
  }, [songId, source])
}

/**
 * Instrument one Worship Mode session: started on mount, ended on unmount or
 * when the tab is closed. Time only counts while the tab is visible. Each song
 * change is written to localStorage as it happens, so a closed or crashed tab
 * is settled on the next visit.
 *
 * @param {{ setlistId: string|null, index: number, isVerse: boolean,
 *   meta: { songId: string, source: 'catalog'|'personal', title: string, tags: string[] }|null,
 *   songKey: string|null }} args
 */
export function useWorshipStats(args) {
  const tracker = useRef(null)
  const latest = useRef(args)
  latest.current = args

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const a = latest.current
    const tr = songStats.startPerformer({ userId: currentUserId, setlistId: a.setlistId })
    tracker.current = tr
    countFeatureUse('performer_mode')
    tr.show(a.index, { skip: a.isVerse })
    if (a.meta) tr.describe(a.index, a.meta)
    if (a.songKey) tr.setKey(a.index, a.songKey)
    if (document.visibilityState === 'hidden') tr.pause()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tr.resume()
      else tr.pause()
    }
    const onPageHide = () => tr.end()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      tracker.current = null
      tr.end()
    }
  }, [args.setlistId])

  useEffect(() => {
    tracker.current?.show(args.index, { skip: args.isVerse })
  }, [args.index, args.isVerse])

  const { meta } = args
  const metaKey = meta ? `${meta.source}|${meta.songId}|${meta.title}|${(meta.tags || []).join('\u0000')}` : ''
  useEffect(() => {
    const a = latest.current
    if (a.meta) tracker.current?.describe(a.index, { ...a.meta, tags: a.meta.tags || [] })
  }, [args.index, metaKey])

  useEffect(() => {
    if (args.songKey) tracker.current?.setKey(args.index, args.songKey)
  }, [args.index, args.songKey])
}
