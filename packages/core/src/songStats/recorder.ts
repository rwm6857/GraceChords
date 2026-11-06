// The Song Stats recorder: one per app, platform-agnostic. It owns
//   * the running performer session, persisted to device storage on every
//     change and recovered (as an "orphan") on the next launch;
//   * a small offline outbox, so a set run with no signal is logged when
//     the signal comes back;
//   * the song-open debounce and the anonymous feature counters;
//   * the opt-out, cached on device so it is honoured before anything is
//     written — an opted-out user's activity never leaves the phone.
//
// It is NOT a general sync layer. It queues three kinds of write for this one
// feature and nothing else. Dropping a log is acceptable; surfacing an error or
// blocking the UI during a service is not, so no method here ever throws.
//
// Storage and the Supabase client are injected (the SongStatsStorage shape is
// AsyncStorage's), which keeps this headless-testable and lets web hand in a
// localStorage adapter.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SONG_STATS_FEATURES, SONG_STATS_RULES, type SongStatsFeature } from './rules'
import {
  checkpointBuffer,
  createPerformerBuffer,
  describeEntry,
  parsePerformerBuffer,
  pauseBuffer,
  resumeBuffer,
  setEntryKey,
  setLiveSession,
  showEntry,
  summarizePerformerBuffer,
  type EntryMeta,
  type PerformerBuffer,
  type PlayRow,
  type SongSource,
} from './performerSession'
import {
  clearMySongStats,
  insertSongOpens,
  insertSongPlays,
  recordFeatureUse,
  type OpenRow,
  type SendResult,
} from './songStatsRepo'

export type SongStatsStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export const SONG_STATS_STORAGE_KEYS = {
  performer: 'gc.songStats.performer.v1',
  outbox: 'gc.songStats.outbox.v1',
  pref: 'gc.songStats.pref.v1',
} as const

const MAX_PLAY_BATCHES = 50
const MAX_OPENS = 500
// The server refuses rows older than 90 days; give up a little before that.
const MAX_QUEUED_AGE_MS = 80 * 24 * 3600 * 1000

type Outbox = {
  v: 1
  plays: Array<{ queuedAt: number; rows: PlayRow[] }>
  opens: Array<{ queuedAt: number; row: OpenRow }>
  /** `${feature}|${YYYY-MM-DD}` → uses not yet sent. */
  counters: Record<string, number>
  /** `${userId}|${songId}` → last recorded open (ms), for the hourly debounce. */
  lastOpenAt: Record<string, number>
}

const emptyOutbox = (): Outbox => ({ v: 1, plays: [], opens: [], counters: {}, lastOpenAt: {} })

export type PerformerTracker = {
  /** The entry at `index` is on screen. `skip` for a verse (not a song). */
  show(index: number, opts?: { skip?: boolean }): void
  /** The song at `index` has loaded. */
  describe(index: number, meta: EntryMeta): void
  /** The key now displayed for `index`, transposition included. */
  setKey(index: number, key: string | null): void
  /** A Live Session is (now) running alongside this set. */
  setLiveSession(liveSessionId: string | null): void
  pause(): void
  resume(): void
  /** Performer mode closed. Applies the capture rule and queues the rows. */
  end(): void
}

const NOOP_TRACKER: PerformerTracker = {
  show() {},
  describe() {},
  setKey() {},
  setLiveSession() {},
  pause() {},
  resume() {},
  end() {},
}

export type SongStatsDeps = {
  client: SupabaseClient
  storage: SongStatsStorage
  now?: () => number
  uuid: () => string
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
}

function localDay(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function utcOffsetMinutes(ms: number): number {
  return -new Date(ms).getTimezoneOffset()
}

async function readJson(storage: SongStatsStorage, key: string): Promise<unknown> {
  try {
    const raw = await storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function createSongStatsRecorder(deps: SongStatsDeps) {
  const now = deps.now ?? (() => Date.now())
  const setIntervalFn = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const clearIntervalFn = deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>))
  const { client, storage } = deps

  let hydrated: Promise<void> | null = null
  let outbox: Outbox = emptyOutbox()
  // Cached opt-out. Unknown (never fetched) counts as on, matching the server
  // default; the app refreshes it from users.preferences after sign-in.
  let pref: { userId: string; enabled: boolean } | null = null
  let active: PerformerBuffer | null = null
  let flushing: Promise<void> | null = null

  // Told whenever this user's play history may have changed: a set queued, a
  // set uploaded, or history cleared. The Song Stats screens use it to drop a
  // cached fetch.
  const listeners = new Set<() => void>()
  function notify() {
    for (const fn of listeners) {
      try {
        fn()
      } catch {
        // A listener must never break recording.
      }
    }
  }

  // Serialize storage writes so a slow write can never land after a newer one.
  let writeChain: Promise<unknown> = Promise.resolve()
  function persist(key: string, value: unknown | null) {
    const json = value == null ? null : JSON.stringify(value)
    writeChain = writeChain
      .then(() => (json == null ? storage.removeItem(key) : storage.setItem(key, json)))
      .catch(() => {})
    return writeChain
  }
  // Never write the outbox before the stored one has been read, or a use
  // counted during launch would overwrite everything queued last time.
  const saveOutbox = () => hydrate().then(() => persist(SONG_STATS_STORAGE_KEYS.outbox, outbox))

  function hydrate(): Promise<void> {
    if (!hydrated) {
      hydrated = (async () => {
        const [rawOutbox, rawPref] = await Promise.all([
          readJson(storage, SONG_STATS_STORAGE_KEYS.outbox),
          readJson(storage, SONG_STATS_STORAGE_KEYS.pref),
        ])
        const o = rawOutbox as Partial<Outbox> | null
        if (o && o.v === 1) {
          // Merge rather than replace: something may have been queued in
          // memory while storage was still being read.
          const counters: Record<string, number> = { ...(o.counters || {}) }
          for (const [k, n] of Object.entries(outbox.counters)) counters[k] = (counters[k] || 0) + n
          outbox = {
            v: 1,
            plays: [...(Array.isArray(o.plays) ? o.plays : []), ...outbox.plays],
            opens: [...(Array.isArray(o.opens) ? o.opens : []), ...outbox.opens],
            counters,
            lastOpenAt: { ...(o.lastOpenAt || {}), ...outbox.lastOpenAt },
          }
        }
        const p = rawPref as { userId?: unknown; enabled?: unknown } | null
        if (!pref && p && typeof p.userId === 'string' && typeof p.enabled === 'boolean') {
          pref = { userId: p.userId, enabled: p.enabled }
        }
      })().catch(() => {})
    }
    return hydrated
  }

  function isEnabled(userId: string | null | undefined): boolean {
    if (!userId) return false
    if (pref && pref.userId === userId) return pref.enabled
    return true
  }

  function trimOutbox() {
    const cutoff = now() - MAX_QUEUED_AGE_MS
    outbox.plays = outbox.plays.filter((b) => b.queuedAt >= cutoff).slice(-MAX_PLAY_BATCHES)
    outbox.opens = outbox.opens.filter((o) => o.queuedAt >= cutoff).slice(-MAX_OPENS)
    const debounceCutoff = now() - SONG_STATS_RULES.openDebounceMs
    for (const [k, t] of Object.entries(outbox.lastOpenAt)) {
      if (t < debounceCutoff) delete outbox.lastOpenAt[k]
    }
  }

  function queuePlays(rows: PlayRow[]) {
    if (rows.length === 0) return
    outbox.plays.push({ queuedAt: now(), rows })
    trimOutbox()
    void saveOutbox()
    notify()
  }

  /** Close a buffer recovered from storage (the app died mid-set). */
  function settleOrphan(buf: PerformerBuffer) {
    if (isEnabled(buf.userId)) {
      queuePlays(summarizePerformerBuffer(buf, buf.savedAt).rows)
    }
  }

  async function sendBatch(run: () => Promise<SendResult>): Promise<'sent' | 'drop' | 'keep'> {
    const r = await run()
    if (r.ok) return 'sent'
    return r.permanent ? 'drop' : 'keep'
  }

  async function flushOnce() {
    await hydrate()
    trimOutbox()
    // clearLocal() swaps in a fresh outbox; stop rather than shift entries
    // out of the new one.
    const box = outbox
    const stale = () => outbox !== box
    let changed = false

    // Plays: one request per performer session so one bad batch can't sink
    // the others. Stop at the first transient failure — the network is down.
    while (box.plays.length > 0) {
      const batch = box.plays[0]
      const outcome = await sendBatch(() => insertSongPlays(client, batch.rows))
      if (stale()) return
      if (outcome === 'keep') break
      box.plays.shift()
      changed = true
      notify()
    }

    if (box.opens.length > 0) {
      const sending = box.opens.slice()
      const outcome = await sendBatch(() => insertSongOpens(client, sending.map((o) => o.row)))
      if (stale()) return
      if (outcome !== 'keep') {
        box.opens = box.opens.slice(sending.length)
        changed = true
      }
    }

    for (const key of Object.keys(box.counters)) {
      const [feature, day] = key.split('|')
      while ((box.counters[key] || 0) > 0) {
        const n = Math.min(box.counters[key], 100)
        const outcome = await sendBatch(() => recordFeatureUse(client, feature as SongStatsFeature, day, n))
        if (stale()) return
        if (outcome === 'keep') break
        // Sent, or refused for good (too old, unknown name): either way it's done.
        box.counters[key] -= outcome === 'sent' ? n : box.counters[key]
        changed = true
      }
      if ((box.counters[key] || 0) <= 0) delete box.counters[key]
    }

    if (changed) await saveOutbox()
  }

  /** Send whatever is queued. Safe to call often; concurrent calls share one run. */
  function flush(): Promise<void> {
    if (!flushing) {
      flushing = flushOnce()
        .catch(() => {})
        .finally(() => {
          flushing = null
        })
    }
    return flushing
  }

  /**
   * Launch-time housekeeping: load the outbox, settle a performer session the
   * app died in the middle of, and try to send. Call once per app start.
   */
  async function start(): Promise<void> {
    await hydrate()
    const orphan = parsePerformerBuffer(await readJson(storage, SONG_STATS_STORAGE_KEYS.performer))
    if (orphan && (!active || active.id !== orphan.id)) {
      await persist(SONG_STATS_STORAGE_KEYS.performer, null)
      settleOrphan(orphan)
    }
    await flush()
  }

  /** Cache this account's opt-out locally (call after reading users.preferences). */
  function setEnabled(userId: string, enabled: boolean) {
    pref = { userId, enabled }
    void persist(SONG_STATS_STORAGE_KEYS.pref, pref)
    if (!enabled) void clearLocal()
  }

  /** Forget everything held on this device: the running set and the outbox. */
  function clearLocal(): Promise<void> {
    active = null
    outbox = emptyOutbox()
    void persist(SONG_STATS_STORAGE_KEYS.performer, null)
    // Empty it again once storage has been read, so hydrate() can't merge the
    // old queue back in.
    const done = hydrate().then(() => {
      outbox = emptyOutbox()
      return persist(SONG_STATS_STORAGE_KEYS.outbox, outbox).then(() => {})
    })
    notify()
    return done
  }

  /** Clear my history: drop local data, then delete server rows. Throws on failure. */
  async function clearHistory(): Promise<{ plays: number; opens: number }> {
    await clearLocal()
    const result = await clearMySongStats(client)
    notify()
    return result
  }

  /** Plays for this user still waiting to upload (a set run offline). */
  async function pendingPlays(userId: string): Promise<PlayRow[]> {
    await hydrate()
    return outbox.plays.flatMap((b) => b.rows).filter((r) => r.user_id === userId)
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  /**
   * Begin a performer session. Returns a no-op tracker when there is no
   * signed-in user or the user has turned Song Stats off, so callers never
   * branch on the setting themselves.
   */
  function startPerformer(init: {
    userId: string | null | undefined
    setlistId?: string | null
    liveSessionId?: string | null
  }): PerformerTracker {
    const userId = init.userId
    if (!userId || !isEnabled(userId)) return NOOP_TRACKER

    // A previous session still in storage (crash, or a second performer
    // screen) is settled first so its time is never merged into this one.
    if (active) settleOrphan(active)
    const t0 = now()
    let buf = createPerformerBuffer(
      {
        id: deps.uuid(),
        userId,
        setlistId: init.setlistId ?? null,
        liveSessionId: init.liveSessionId ?? null,
        utcOffsetMinutes: utcOffsetMinutes(t0),
      },
      t0,
    )
    active = buf
    let ended = false
    void persist(SONG_STATS_STORAGE_KEYS.performer, buf)

    const update = (next: PerformerBuffer) => {
      if (ended || active?.id !== buf.id) return
      if (next === buf) return
      buf = next
      active = next
      void persist(SONG_STATS_STORAGE_KEYS.performer, buf)
    }

    let timer: unknown = setIntervalFn(() => update(checkpointBuffer(buf, now())), SONG_STATS_RULES.checkpointMs)
    const stopTimer = () => {
      if (timer != null) clearIntervalFn(timer)
      timer = null
    }

    return {
      show: (index, opts) => update(showEntry(buf, index, now(), opts)),
      describe: (index, meta) => update(describeEntry(buf, index, meta)),
      setKey: (index, key) => update(setEntryKey(buf, index, key)),
      setLiveSession: (id) => update(setLiveSession(buf, id)),
      pause: () => {
        stopTimer()
        update(pauseBuffer(buf, now()))
      },
      resume: () => {
        if (ended) return
        update(resumeBuffer(buf, now()))
        if (timer == null) {
          timer = setIntervalFn(() => update(checkpointBuffer(buf, now())), SONG_STATS_RULES.checkpointMs)
        }
      },
      end: () => {
        if (ended) return
        stopTimer()
        const summary = summarizePerformerBuffer(buf, now())
        ended = true
        if (active?.id === buf.id) {
          active = null
          void persist(SONG_STATS_STORAGE_KEYS.performer, null)
          // Re-check: the user may have opted out while the set was running.
          if (isEnabled(buf.userId)) queuePlays(summary.rows)
          void flush()
        }
      },
    }
  }

  /**
   * A song has stayed on screen in a viewer for SONG_STATS_RULES.minOpenDisplayMs.
   * The caller owns that timer; this applies the hourly debounce and queues it.
   */
  function recordOpen(open: { userId: string | null | undefined; songId: string; source: SongSource; openedAt: number }) {
    if (!open.userId || !open.songId || !isEnabled(open.userId)) return
    const key = `${open.userId}|${open.songId}`
    const last = outbox.lastOpenAt[key]
    if (last != null && open.openedAt - last < SONG_STATS_RULES.openDebounceMs) return
    outbox.lastOpenAt[key] = open.openedAt
    outbox.opens.push({
      queuedAt: now(),
      row: {
        user_id: open.userId,
        song_id: open.songId,
        song_source: open.source,
        opened_at: new Date(open.openedAt).toISOString(),
      },
    })
    trimOutbox()
    void saveOutbox()
    void flush()
  }

  /** Count one use of a feature. Anonymous: nothing about the user is sent. */
  function countFeature(feature: SongStatsFeature, userId: string | null | undefined) {
    if (!(SONG_STATS_FEATURES as readonly string[]).includes(feature)) return
    if (!userId || !isEnabled(userId)) return
    const key = `${feature}|${localDay(now())}`
    outbox.counters[key] = (outbox.counters[key] || 0) + 1
    void saveOutbox()
  }

  return {
    start,
    flush,
    setEnabled,
    isEnabled,
    clearLocal,
    clearHistory,
    startPerformer,
    recordOpen,
    countFeature,
    pendingPlays,
    subscribe,
  }
}

export type SongStatsRecorder = ReturnType<typeof createSongStatsRecorder>
