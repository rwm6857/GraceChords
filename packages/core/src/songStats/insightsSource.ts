// Where the Song Stats screens get their rows. Fetched on screen open and
// cached for a day (the spec's query-load rule: no recompute-on-every-open,
// no nightly rollup), with plays still waiting in the device outbox merged
// in so a set run offline counts at once. Any change the recorder reports —
// a set queued or uploaded, history cleared — drops the cache.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SongStatsRecorder, SongStatsStorage } from './recorder'
import {
  fetchMySongOpens,
  fetchMySongPlays,
  fetchSongTitles,
  type FetchedOpen,
  type FetchedPlay,
} from './songStatsRepo'
import { mergePendingPlays, songStatsWindowStart } from './insights'
import type { SongStatsWindow } from './rules'

export const SONG_STATS_CACHE_MS = 24 * 60 * 60 * 1000
export const SONG_STATS_INSIGHTS_STORAGE_KEY = 'gc.songStats.insights.v1'

export type SongStatsPlayData = {
  plays: FetchedPlay[]
  titles: Record<string, string>
}

type CachedPlays = { v: 1; userId: string; fetchedAt: number; plays: FetchedPlay[]; titles: Record<string, string> }

export function createSongStatsDataSource(deps: {
  client: SupabaseClient
  storage: SongStatsStorage
  recorder: Pick<SongStatsRecorder, 'pendingPlays' | 'subscribe'>
  now?: () => number
}) {
  const now = deps.now ?? (() => Date.now())
  const { client, storage, recorder } = deps

  let plays: CachedPlays | null = null
  let restored = false
  const opens = new Map<string, { fetchedAt: number; rows: FetchedOpen[] }>()
  let generation = 0
  const listeners = new Set<() => void>()

  function invalidate() {
    generation += 1
    plays = null
    restored = true
    opens.clear()
    void storage.removeItem(SONG_STATS_INSIGHTS_STORAGE_KEY).catch(() => {})
    for (const fn of listeners) fn()
  }
  recorder.subscribe(invalidate)

  const fresh = (fetchedAt: number) => now() - fetchedAt < SONG_STATS_CACHE_MS && fetchedAt <= now()

  async function restore(userId: string) {
    if (restored) return
    restored = true
    try {
      const raw = await storage.getItem(SONG_STATS_INSIGHTS_STORAGE_KEY)
      const c = raw ? (JSON.parse(raw) as CachedPlays) : null
      if (c && c.v === 1 && c.userId === userId && Array.isArray(c.plays) && !plays) plays = c
    } catch {
      // Unreadable cache: fetch.
    }
  }

  /** The user's plays (fetched + pending) and current titles. Throws if a needed fetch fails. */
  async function loadPlays(userId: string, opts: { force?: boolean } = {}): Promise<SongStatsPlayData> {
    await restore(userId)
    if (opts.force || !plays || plays.userId !== userId || !fresh(plays.fetchedAt)) {
      const gen = generation
      const rows = await fetchMySongPlays(client, userId)
      const titles = await fetchSongTitles(
        client,
        rows.map((r) => ({ songId: r.song_id, source: r.song_source })),
      )
      const next: CachedPlays = { v: 1, userId, fetchedAt: now(), plays: rows, titles }
      // Something changed while we were fetching; the result may already be stale.
      if (gen === generation) {
        plays = next
        void storage.setItem(SONG_STATS_INSIGHTS_STORAGE_KEY, JSON.stringify(next)).catch(() => {})
      }
      return withPending(userId, next)
    }
    return withPending(userId, plays)
  }

  async function withPending(userId: string, c: CachedPlays): Promise<SongStatsPlayData> {
    const pending = await recorder.pendingPlays(userId)
    return { plays: mergePendingPlays<FetchedPlay>(c.plays, pending), titles: c.titles }
  }

  /** Song-viewer opens for a window. Memory-cached only; the detail view is the one reader. */
  async function loadOpens(
    userId: string,
    window: SongStatsWindow,
    opts: { force?: boolean } = {},
  ): Promise<FetchedOpen[]> {
    const key = `${userId}|${window}`
    const hit = opens.get(key)
    if (!opts.force && hit && fresh(hit.fetchedAt)) return hit.rows
    const gen = generation
    const start = songStatsWindowStart(window, now())
    const rows = await fetchMySongOpens(client, userId, start == null ? null : new Date(start).toISOString())
    if (gen === generation) opens.set(key, { fetchedAt: now(), rows })
    return rows
  }

  /** Called when cached data was dropped, so an open screen can reload. */
  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  return { loadPlays, loadOpens, invalidate, subscribe }
}

export type SongStatsDataSource = ReturnType<typeof createSongStatsDataSource>
