// Pure state for one performer-mode session (mobile "Start set", web Worship
// Mode). Every function returns a new buffer; the recorder persists each one
// to device storage at the moment it changes, so a force-quit or dead battery
// loses at most one checkpoint interval.
//
// Time is accrued per setlist ENTRY (index), not per song, so a reprise of the
// same song is its own play and revisiting an entry adds to its total. A
// segment is open while `current.since` is set; pausing (app backgrounded, tab
// hidden) closes it so time off screen never counts.

import { SONG_STATS_RULES, sessionQualifies } from './rules'

export type SongSource = 'catalog' | 'personal'

export type EntryMeta = {
  songId: string
  source: SongSource
  title: string
  tags: string[]
}

export type BufferEntry = {
  /** Null until the song has loaded; verse entries stay null forever. */
  meta: EntryMeta | null
  /** Verse (or other non-song) entry: counts toward set time, never logged. */
  skip: boolean
  /** Key last displayed for this entry, transposition included. */
  key: string | null
  firstShownAt: number
  dwellMs: number
}

export type PerformerBuffer = {
  v: 1
  /** performer_session_id — NOT a Live Session id. */
  id: string
  userId: string
  setlistId: string | null
  liveSessionId: string | null
  utcOffsetMinutes: number
  startedAt: number
  /** Last time this buffer was accrued; the end time used for an orphan. */
  savedAt: number
  current: { index: number; since: number | null } | null
  entries: Record<string, BufferEntry>
}

export type PlayRow = {
  user_id: string
  performer_session_id: string
  entry_index: number
  song_id: string
  song_source: SongSource
  song_title: string
  song_tags: string[]
  song_key: string | null
  setlist_id: string | null
  live_session_id: string | null
  played_at: string
  utc_offset_minutes: number
}

export function createPerformerBuffer(
  init: {
    id: string
    userId: string
    setlistId?: string | null
    liveSessionId?: string | null
    utcOffsetMinutes: number
  },
  now: number,
): PerformerBuffer {
  return {
    v: 1,
    id: init.id,
    userId: init.userId,
    setlistId: init.setlistId ?? null,
    liveSessionId: init.liveSessionId ?? null,
    utcOffsetMinutes: init.utcOffsetMinutes,
    startedAt: now,
    savedAt: now,
    current: null,
    entries: {},
  }
}

/** Fold the open segment's time into its entry, up to `now`. */
function accrue(buf: PerformerBuffer, now: number): PerformerBuffer {
  const cur = buf.current
  if (!cur || cur.since == null) return { ...buf, savedAt: Math.max(buf.savedAt, now) }
  const key = String(cur.index)
  const entry = buf.entries[key]
  // A clock that jumped backwards adds nothing rather than going negative.
  const add = Math.max(0, now - cur.since)
  const entries = entry ? { ...buf.entries, [key]: { ...entry, dwellMs: entry.dwellMs + add } } : buf.entries
  return {
    ...buf,
    entries,
    savedAt: Math.max(buf.savedAt, now),
    current: { index: cur.index, since: Math.max(cur.since, now) },
  }
}

/** The entry at `index` is now on screen. */
export function showEntry(
  buf: PerformerBuffer,
  index: number,
  now: number,
  opts: { skip?: boolean } = {},
): PerformerBuffer {
  const accrued = accrue(buf, now)
  const key = String(index)
  const existing = accrued.entries[key]
  const entry: BufferEntry = existing
    ? { ...existing, skip: existing.skip || !!opts.skip }
    : { meta: null, skip: !!opts.skip, key: null, firstShownAt: now, dwellMs: 0 }
  const paused = accrued.current != null && accrued.current.since == null
  return {
    ...accrued,
    entries: { ...accrued.entries, [key]: entry },
    current: { index, since: paused ? null : now },
  }
}

/** Attach song identity once it has loaded. No-op for unknown or skipped entries. */
export function describeEntry(buf: PerformerBuffer, index: number, meta: EntryMeta): PerformerBuffer {
  const key = String(index)
  const entry = buf.entries[key]
  if (!entry || entry.skip) return buf
  const same =
    entry.meta &&
    entry.meta.songId === meta.songId &&
    entry.meta.title === meta.title &&
    entry.meta.source === meta.source &&
    entry.meta.tags.join('\u0000') === meta.tags.join('\u0000')
  if (same) return buf
  return { ...buf, entries: { ...buf.entries, [key]: { ...entry, meta } } }
}

/** Record the key currently displayed for an entry. */
export function setEntryKey(buf: PerformerBuffer, index: number, songKey: string | null): PerformerBuffer {
  const key = String(index)
  const entry = buf.entries[key]
  if (!entry || entry.key === songKey) return buf
  return { ...buf, entries: { ...buf.entries, [key]: { ...entry, key: songKey } } }
}

/** A Live Session started (or was adopted) mid-set. The last one seen wins. */
export function setLiveSession(buf: PerformerBuffer, liveSessionId: string | null): PerformerBuffer {
  if (!liveSessionId || buf.liveSessionId === liveSessionId) return buf
  return { ...buf, liveSessionId }
}

/** Screen left the foreground: stop counting time. */
export function pauseBuffer(buf: PerformerBuffer, now: number): PerformerBuffer {
  const accrued = accrue(buf, now)
  if (!accrued.current) return accrued
  return { ...accrued, current: { index: accrued.current.index, since: null } }
}

/** Screen is back: resume counting on whatever entry is showing. */
export function resumeBuffer(buf: PerformerBuffer, now: number): PerformerBuffer {
  if (!buf.current || buf.current.since != null) return buf
  return { ...buf, savedAt: Math.max(buf.savedAt, now), current: { index: buf.current.index, since: now } }
}

/** Periodic save point: fold time so far into the buffer. */
export function checkpointBuffer(buf: PerformerBuffer, now: number): PerformerBuffer {
  return accrue(buf, now)
}

export type PerformerSummary = {
  qualifies: boolean
  activeMs: number
  songCount: number
  rows: PlayRow[]
}

/**
 * Close the session at `endAt` and apply the capture rule. For a buffer
 * recovered after a crash, pass its own `savedAt`: time after the last
 * checkpoint is unknown and is not invented.
 */
export function summarizePerformerBuffer(buf: PerformerBuffer, endAt: number): PerformerSummary {
  const closed = accrue(buf, Math.max(endAt, buf.current?.since ?? endAt))
  const all = Object.entries(closed.entries)
  const activeMs = all.reduce((sum, [, e]) => sum + e.dwellMs, 0)
  const counted = all
    .filter(([, e]) => !e.skip && e.meta && e.dwellMs >= SONG_STATS_RULES.minSongDisplayMs)
    .sort(([a], [b]) => Number(a) - Number(b))
  const qualifies = sessionQualifies(counted.length, activeMs)
  const rows: PlayRow[] = qualifies
    ? counted.map(([index, e]) => ({
        user_id: closed.userId,
        performer_session_id: closed.id,
        entry_index: Number(index),
        song_id: e.meta!.songId,
        song_source: e.meta!.source,
        song_title: e.meta!.title.slice(0, 300),
        song_tags: e.meta!.tags.filter((t) => typeof t === 'string' && t).slice(0, 30),
        song_key: e.key ? e.key.slice(0, 12) : null,
        setlist_id: closed.setlistId,
        live_session_id: closed.liveSessionId,
        played_at: new Date(e.firstShownAt).toISOString(),
        utc_offset_minutes: closed.utcOffsetMinutes,
      }))
    : []
  return { qualifies, activeMs, songCount: counted.length, rows }
}

/** Shape check for a buffer read back from storage (older/corrupt → null). */
export function parsePerformerBuffer(raw: unknown): PerformerBuffer | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Partial<PerformerBuffer>
  if (b.v !== 1 || typeof b.id !== 'string' || typeof b.userId !== 'string') return null
  if (typeof b.savedAt !== 'number' || !b.entries || typeof b.entries !== 'object') return null
  return b as PerformerBuffer
}
