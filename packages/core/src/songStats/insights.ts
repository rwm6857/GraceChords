// Song Stats insights: pure functions from a user's own play and open rows to
// what the Song Stats screens show. Mobile and web render this one result; no
// stat logic lives in a component.
//
// Plays and opens stay separate all the way through. "Most sung" counts plays
// only and "Most opened" counts opens only — a song someone studied ten times
// is not a song their church sings.
//
// Every date shown to the user is the row's LOCAL date (played_at shifted by
// the utc_offset_minutes captured on the device), so a Sunday-evening set is
// a Sunday set wherever the reader is now.

import { SONG_STATS_INSIGHT_RULES as R, type SongStatsWindow } from './rules'
import type { SongSource } from './performerSession'

const DAY_MS = 86_400_000

/** The play-row columns the insights need. */
export type StatsPlay = {
  performer_session_id: string
  song_id: string
  song_source: SongSource
  song_title: string
  played_at: string
  utc_offset_minutes: number
}

export type StatsOpen = {
  song_id: string
  song_source: SongSource
  opened_at: string
}

/** `${source}:${songId}` — the identity used for titles and grouping. */
export type SongKey = string

export const songKey = (source: SongSource, songId: string): SongKey => `${source}:${songId}`

export type StatsSong = {
  key: SongKey
  songId: string
  source: SongSource
  /** Current title where the song still exists, else the title as it was sung. Null for an opened-only song that no longer exists. */
  title: string | null
}

export type SongStatsSummary = {
  sessions: number
  distinctSongs: number
  /** Songs per set, one decimal. Null with no sets in the window. */
  avgSongsPerSet: number | null
  /** Songs first sung inside the window. Null for "all time", where every song is new. */
  newSongs: number | null
}

export type SongStatsInsights = {
  window: SongStatsWindow
  /** Sets logged, all time — what the gate counts. */
  totalSessions: number
  gateMet: boolean
  summary: SongStatsSummary
  mostSung: Array<StatsSong & { count: number }>
  /** Null when opens were not supplied (the summary card never loads them). */
  mostOpened: Array<StatsSong & { count: number }> | null
  /** Empty for "all time". Most recent first. */
  newThisPeriod: Array<StatsSong & { firstSung: string }>
  /** Share (0–100) of the songs in the latest recent sets that were also in the ones before. Null below 2 × recentSessions sets. */
  repeatRate: number | null
  heavyRotation: Array<StatsSong & { sets: number; of: number }>
  /** Not sung in R.dormantDays. Most recently sung first. */
  resting: Array<StatsSong & { lastSung: string }>
  /** Sung longest and still in use. Earliest first. */
  longTime: Array<StatsSong & { firstSung: string }>
}

/** Start of a trailing window, or null for all time. */
export function songStatsWindowStart(window: SongStatsWindow, now: number): number | null {
  if (window === 'all') return null
  const d = new Date(now)
  d.setMonth(d.getMonth() - (window === '1m' ? 1 : window === '3m' ? 3 : 12))
  return d.getTime()
}

/** The device-local calendar date (YYYY-MM-DD) a play happened on. */
export function playLocalDate(play: Pick<StatsPlay, 'played_at' | 'utc_offset_minutes'>): string {
  const ms = Date.parse(play.played_at) + (play.utc_offset_minutes || 0) * 60_000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Format a YYYY-MM-DD local date for display, short: "Aug 2", with the year
 * only when it isn't the current one ("Aug 2, 2025"). Formatted as UTC on
 * purpose: the date is already local to where the set was sung, and
 * re-applying the reader's timezone could move it a day.
 */
export function formatSongStatsDate(localDate: string, language: string, now: number = Date.now()): string {
  const [y, m, d] = localDate.split('-').map(Number)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  if (y !== new Date(now).getFullYear()) opts.year = 'numeric'
  try {
    return new Intl.DateTimeFormat(language, opts).format(Date.UTC(y, (m || 1) - 1, d || 1))
  } catch {
    return localDate
  }
}

type SongAgg = {
  key: SongKey
  songId: string
  source: SongSource
  snapshot: string
  snapshotAt: number
  first: number
  firstPlay: StatsPlay
  last: number
  lastPlay: StatsPlay
}

type Session = { id: string; at: number; songs: Set<SongKey>; rows: number }

export function computeSongStats(input: {
  plays: StatsPlay[]
  opens?: StatsOpen[] | null
  window: SongStatsWindow
  now: number
  /** Current titles by SongKey, for songs renamed since they were sung. */
  titles?: Record<SongKey, string>
}): SongStatsInsights {
  const { window, now } = input
  const titles = input.titles ?? {}
  const start = songStatsWindowStart(window, now)
  const inWindow = (ms: number) => start == null || ms >= start

  // A retried upload can't duplicate a row server-side, but a pending local
  // copy of a set can overlap the fetched one; callers dedupe before this.
  const plays = input.plays
    .map((p) => ({ p, at: Date.parse(p.played_at) }))
    .filter((x) => Number.isFinite(x.at))

  const songs = new Map<SongKey, SongAgg>()
  const sessions = new Map<string, Session>()
  for (const { p, at } of plays) {
    const key = songKey(p.song_source, p.song_id)
    const agg = songs.get(key)
    if (!agg) {
      songs.set(key, {
        key,
        songId: p.song_id,
        source: p.song_source,
        snapshot: p.song_title,
        snapshotAt: at,
        first: at,
        firstPlay: p,
        last: at,
        lastPlay: p,
      })
    } else {
      if (at < agg.first) {
        agg.first = at
        agg.firstPlay = p
      }
      if (at > agg.last) {
        agg.last = at
        agg.lastPlay = p
      }
      if (at >= agg.snapshotAt) {
        agg.snapshot = p.song_title
        agg.snapshotAt = at
      }
    }
    const s = sessions.get(p.performer_session_id)
    if (!s) sessions.set(p.performer_session_id, { id: p.performer_session_id, at, songs: new Set([key]), rows: 1 })
    else {
      s.at = Math.min(s.at, at)
      s.songs.add(key)
      s.rows += 1
    }
  }

  const song = (key: SongKey, songId: string, source: SongSource): StatsSong => ({
    key,
    songId,
    source,
    title: titles[key] ?? songs.get(key)?.snapshot ?? null,
  })

  // ── Window stats ────────────────────────────────────────────────────────
  const windowSessions = [...sessions.values()].filter((s) => inWindow(s.at))
  const windowRows = windowSessions.reduce((n, s) => n + s.rows, 0)
  const counts = new Map<SongKey, { count: number; last: number }>()
  for (const { p, at } of plays) {
    if (!inWindow(at)) continue
    const key = songKey(p.song_source, p.song_id)
    const c = counts.get(key)
    if (c) {
      c.count += 1
      c.last = Math.max(c.last, at)
    } else counts.set(key, { count: 1, last: at })
  }
  const newSongs = [...songs.values()].filter((a) => start != null && a.first >= start)

  const mostSung = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, R.topSongs)
    .map(([key, c]) => {
      const a = songs.get(key)!
      return { ...song(key, a.songId, a.source), count: c.count }
    })

  let mostOpened: SongStatsInsights['mostOpened'] = null
  if (input.opens) {
    const opened = new Map<SongKey, { songId: string; source: SongSource; count: number; last: number }>()
    for (const o of input.opens) {
      const at = Date.parse(o.opened_at)
      if (!Number.isFinite(at) || !inWindow(at)) continue
      const key = songKey(o.song_source, o.song_id)
      const c = opened.get(key)
      if (c) {
        c.count += 1
        c.last = Math.max(c.last, at)
      } else opened.set(key, { songId: o.song_id, source: o.song_source, count: 1, last: at })
    }
    mostOpened = [...opened.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
      .slice(0, R.topSongs)
      .map(([key, c]) => ({ ...song(key, c.songId, c.source), count: c.count }))
  }

  // ── Fixed-horizon stats (independent of the window) ─────────────────────
  const ordered = [...sessions.values()].sort((a, b) => b.at - a.at)
  const recent = ordered.slice(0, R.recentSessions)
  const before = ordered.slice(R.recentSessions, R.recentSessions * 2)

  let repeatRate: number | null = null
  if (before.length === R.recentSessions) {
    const recentSongs = new Set(recent.flatMap((s) => [...s.songs]))
    const beforeSongs = new Set(before.flatMap((s) => [...s.songs]))
    let shared = 0
    for (const k of recentSongs) if (beforeSongs.has(k)) shared += 1
    repeatRate = recentSongs.size ? Math.round((shared / recentSongs.size) * 100) : null
  }

  const inRecent = new Map<SongKey, number>()
  for (const s of recent) for (const k of s.songs) inRecent.set(k, (inRecent.get(k) || 0) + 1)
  const heavyRotation = [...inRecent.entries()]
    .filter(([, n]) => n >= R.heavyRotationMin)
    .sort((a, b) => b[1] - a[1] || songs.get(b[0])!.last - songs.get(a[0])!.last)
    .map(([key, n]) => {
      const a = songs.get(key)!
      return { ...song(key, a.songId, a.source), sets: n, of: recent.length }
    })

  const restingCutoff = now - R.dormantDays * DAY_MS
  const resting = [...songs.values()]
    .filter((a) => a.last < restingCutoff)
    .sort((a, b) => b.last - a.last)
    .slice(0, R.dormantMax)
    .map((a) => ({ ...song(a.key, a.songId, a.source), lastSung: playLocalDate(a.lastPlay) }))

  // Only songs that predate the active window: for a newer user every song
  // would otherwise qualify, and the list would say nothing.
  const activeCutoff = now - R.activeDays * DAY_MS
  const longTime = [...songs.values()]
    .filter((a) => a.last >= activeCutoff && a.first < activeCutoff)
    .sort((a, b) => a.first - b.first)
    .slice(0, R.longTimeMax)
    .map((a) => ({ ...song(a.key, a.songId, a.source), firstSung: playLocalDate(a.firstPlay) }))

  return {
    window,
    totalSessions: sessions.size,
    gateMet: sessions.size >= R.gateSessions,
    summary: {
      sessions: windowSessions.length,
      distinctSongs: counts.size,
      avgSongsPerSet: windowSessions.length ? Math.round((windowRows / windowSessions.length) * 10) / 10 : null,
      newSongs: start == null ? null : newSongs.length,
    },
    mostSung,
    mostOpened,
    newThisPeriod:
      start == null
        ? []
        : newSongs
            .sort((a, b) => b.first - a.first)
            .slice(0, R.topSongs)
            .map((a) => ({ ...song(a.key, a.songId, a.source), firstSung: playLocalDate(a.firstPlay) })),
    repeatRate,
    heavyRotation,
    resting,
    longTime,
  }
}

/**
 * Merge plays still waiting in the device outbox into fetched ones, so a set
 * run offline shows up straight away. Keyed like the table's primary key.
 */
export function mergePendingPlays<T extends StatsPlay & { entry_index?: number }>(
  fetched: T[],
  pending: T[],
): T[] {
  if (pending.length === 0) return fetched
  const seen = new Set(fetched.map((p) => `${p.performer_session_id}|${p.entry_index ?? ''}`))
  return [...fetched, ...pending.filter((p) => !seen.has(`${p.performer_session_id}|${p.entry_index ?? ''}`))]
}
