import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useIsFocused } from '@react-navigation/native'
import {
  SONG_STATS_RULES,
  createSongStatsDataSource,
  createSongStatsPreviewStore,
  createSongStatsRecorder,
  fetchSongStatsEnabled,
  saveSongStatsEnabled,
  type EntryMeta,
  type PerformerTracker,
  type SongSource,
  type SongStatsFeature,
} from '@gracechords/core'
import { supabase } from './supabase'
import { getCurrentUserSnapshot } from './currentUser'
import { uuidv4 } from './uuid'

// Song Stats on mobile: the one recorder for the app, plus the hooks that feed
// it. The screens that read it back are in useSongStatsInsights.ts. All the rules,
// buffering and offline queueing live in core (packages/core/src/songStats);
// this file only connects them to React Native lifecycles: screen focus,
// AppState, and the signed-in user.
//
// Nothing here may throw into a screen or change what a screen renders.
// Performer mode and the Song Viewer are locked surfaces; these hooks are
// invisible instrumentation.

export const songStats = createSongStatsRecorder({
  client: supabase,
  storage: AsyncStorage,
  uuid: uuidv4,
})

/** Cached reads for the Song Stats screens; dropped whenever the recorder reports a change. */
export const songStatsData = createSongStatsDataSource({
  client: supabase,
  storage: AsyncStorage,
  recorder: songStats,
})

/** Dev-build / admin preview switches (bypass the gate, sample history). */
export const songStatsPreview = createSongStatsPreviewStore(AsyncStorage)

const currentUserId = () => getCurrentUserSnapshot().user?.id ?? null

/**
 * Call once the session is known (launch, and each sign-in): loads the outbox,
 * logs any set the app died in the middle of, refreshes the opt-out from
 * users.preferences, and sends what's queued.
 */
export function startSongStats(userId: string | null): void {
  void songStats.start()
  if (!userId) return
  fetchSongStatsEnabled(supabase, userId)
    .then((enabled) => songStats.setEnabled(userId, enabled))
    // Offline or a failed read: keep the cached value.
    .catch(() => {})
}

/** Flush the outbox whenever the app comes back to the foreground. */
export function registerSongStatsLifecycle(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') void songStats.flush()
  })
  return () => sub.remove()
}

/** Turn Song Stats on/off for the signed-in account. Throws on failure. */
export async function setSongStatsEnabled(enabled: boolean): Promise<void> {
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')
  await saveSongStatsEnabled(supabase, userId, enabled)
  songStats.setEnabled(userId, enabled)
}

/** Whether Song Stats is on for the signed-in account (cached on device). */
export function isSongStatsEnabled(): boolean {
  return songStats.isEnabled(currentUserId())
}

/** Count one anonymous use of a feature. */
export function countFeatureUse(feature: SongStatsFeature): void {
  songStats.countFeature(feature, currentUserId())
}

/** Count one use of a feature each time the calling screen mounts. */
export function useFeatureUseOnOpen(feature: SongStatsFeature): void {
  useEffect(() => {
    countFeatureUse(feature)
  }, [feature])
}

/**
 * Record a song-viewer open once the song has stayed on screen for
 * SONG_STATS_RULES.minOpenDisplayMs without the screen losing focus or the app
 * going to the background. The recorder applies the hourly debounce.
 */
export function useSongOpenStats(song: { songId: string | undefined; source: SongSource } | null): void {
  const isFocused = useIsFocused()
  const songId = song?.songId
  const source = song?.source ?? 'catalog'

  useEffect(() => {
    if (!songId || !isFocused) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const arm = () => {
      if (timer) clearTimeout(timer)
      const openedAt = Date.now()
      timer = setTimeout(() => {
        timer = null
        songStats.recordOpen({ userId: currentUserId(), songId, source, openedAt })
      }, SONG_STATS_RULES.minOpenDisplayMs)
    }
    if (AppState.currentState === 'active') arm()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') arm()
      else if (timer) {
        clearTimeout(timer)
        timer = null
      }
    })
    return () => {
      sub.remove()
      if (timer) clearTimeout(timer)
    }
  }, [songId, source, isFocused])
}

/**
 * Instrument one performer-mode session. Started on mount and ended on
 * unmount; time only counts while the screen is focused and the app is in the
 * foreground. Each song change is written to device storage the moment it
 * happens (not at teardown), so a force-quit is recovered on next launch.
 */
export function usePerformerStats(args: {
  setlistId: string
  index: number
  /** The entry at `index` is a Bible verse: counts toward set time, never logged. */
  isVerse: boolean
  /** The song at `index`, once it has loaded (null until then). */
  meta: EntryMeta | null
  /** The key on screen, transposition included (null until the song loads). */
  songKey: string | null
  liveSessionId: string | null
}): void {
  const isFocused = useIsFocused()
  const tracker = useRef<PerformerTracker | null>(null)
  const latest = useRef(args)
  latest.current = args
  const focused = useRef(isFocused)
  const appActive = useRef(AppState.currentState === 'active')

  const syncRunning = () => {
    if (focused.current && appActive.current) tracker.current?.resume()
    else tracker.current?.pause()
  }

  useEffect(() => {
    const a = latest.current
    const tr = songStats.startPerformer({
      userId: currentUserId(),
      setlistId: a.setlistId,
      liveSessionId: a.liveSessionId,
    })
    tracker.current = tr
    countFeatureUse('performer_mode')
    tr.show(a.index, { skip: a.isVerse })
    if (a.meta) tr.describe(a.index, a.meta)
    if (a.songKey) tr.setKey(a.index, a.songKey)
    syncRunning()
    const sub = AppState.addEventListener('change', (state) => {
      appActive.current = state === 'active'
      syncRunning()
    })
    return () => {
      sub.remove()
      tracker.current = null
      tr.end()
    }
    // syncRunning reads refs only; the session is per setlist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.setlistId])

  useEffect(() => {
    focused.current = isFocused
    syncRunning()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused])

  useEffect(() => {
    tracker.current?.show(args.index, { skip: args.isVerse })
  }, [args.index, args.isVerse])

  const { meta } = args
  const metaKey = meta ? `${meta.source}|${meta.songId}|${meta.title}|${meta.tags.join('\u0000')}` : ''
  useEffect(() => {
    const a = latest.current
    if (a.meta) tracker.current?.describe(a.index, a.meta)
  }, [args.index, metaKey])

  useEffect(() => {
    if (args.songKey) tracker.current?.setKey(args.index, args.songKey)
  }, [args.index, args.songKey])

  useEffect(() => {
    tracker.current?.setLiveSession(args.liveSessionId)
  }, [args.liveSessionId])
}
