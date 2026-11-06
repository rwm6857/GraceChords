import { describe, expect, it } from 'vitest'
import {
  SONG_STATS_RULES,
  SONG_STATS_STORAGE_KEYS,
  createPerformerBuffer,
  createSongStatsRecorder,
  describeEntry,
  pauseBuffer,
  requiredSessionMs,
  resumeBuffer,
  setEntryKey,
  showEntry,
  songStatsEnabledFromPreferences,
  summarizePerformerBuffer,
  type EntryMeta,
  type PerformerBuffer,
} from '@gracechords/core'

const SEC = 1000
const MIN = 60 * SEC
const song = (n: number): EntryMeta => ({ songId: `song-${n}`, source: 'catalog', title: `Song ${n}`, tags: ['Slow'] })

function buffer(): PerformerBuffer {
  return createPerformerBuffer({ id: 'perf-1', userId: 'user-1', setlistId: 'set-1', utcOffsetMinutes: -300 }, 0)
}

/** Show songs in order, each for the given ms, then summarize at the end. */
function run(durations: number[]) {
  let b = buffer()
  let t = 0
  durations.forEach((ms, i) => {
    b = describeEntry(showEntry(b, i, t), i, song(i))
    t += ms
  })
  return summarizePerformerBuffer(b, t)
}

describe('capture rule', () => {
  it('scales with the number of counted songs, with a 2 minute floor', () => {
    expect(requiredSessionMs(1)).toBe(2.5 * MIN)
    expect(requiredSessionMs(2)).toBe(5 * MIN)
    expect(requiredSessionMs(4)).toBe(10 * MIN)
    expect(requiredSessionMs(0)).toBe(2 * MIN)
  })

  it('logs a single-song set of 2.5 minutes, and not one of 1 minute', () => {
    expect(run([2.5 * MIN]).rows).toHaveLength(1)
    expect(run([1 * MIN]).rows).toHaveLength(0)
  })

  it('writes nothing for a set below its scaled threshold', () => {
    // Four songs counted → needs 10 minutes; 4 × 2 min = 8.
    const s = run([2 * MIN, 2 * MIN, 2 * MIN, 2 * MIN])
    expect(s.songCount).toBe(4)
    expect(s.qualifies).toBe(false)
    expect(s.rows).toEqual([])
  })

  it('excludes a song shown under 30 seconds but logs the rest', () => {
    const s = run([4 * MIN, 10 * SEC, 4 * MIN])
    expect(s.qualifies).toBe(true)
    expect(s.rows.map((r) => r.entry_index)).toEqual([0, 2])
  })

  it('counts a skipped song toward set time but never logs it', () => {
    let b = buffer()
    b = showEntry(b, 0, 0, { skip: true }) // a Bible verse
    b = describeEntry(showEntry(b, 1, 2 * MIN), 1, song(1))
    const s = summarizePerformerBuffer(b, 3 * MIN)
    expect(s.activeMs).toBe(3 * MIN)
    expect(s.rows.map((r) => r.song_id)).toEqual(['song-1'])
  })

  it('does not count time while paused (backgrounded)', () => {
    let b = describeEntry(showEntry(buffer(), 0, 0), 0, song(0))
    b = pauseBuffer(b, 1 * MIN)
    b = resumeBuffer(b, 60 * MIN)
    const s = summarizePerformerBuffer(b, 61 * MIN)
    expect(s.activeMs).toBe(2 * MIN)
    expect(s.qualifies).toBe(false)
  })

  it('adds a revisited entry to its earlier time and keeps a reprise separate', () => {
    let b = buffer()
    b = describeEntry(showEntry(b, 0, 0), 0, song(0))
    b = describeEntry(showEntry(b, 1, 1 * MIN), 1, song(1))
    b = showEntry(b, 0, 3 * MIN) // back to the first entry
    b = describeEntry(showEntry(b, 2, 5 * MIN), 2, song(0)) // same song again later in the set
    const s = summarizePerformerBuffer(b, 8 * MIN)
    expect(s.rows.map((r) => [r.entry_index, r.song_id])).toEqual([
      [0, 'song-0'],
      [1, 'song-1'],
      [2, 'song-0'],
    ])
  })

  it('denormalizes what was on screen onto each row', () => {
    let b = describeEntry(showEntry(buffer(), 0, 1_000), 0, song(7))
    b = setEntryKey(b, 0, 'Bb')
    const [row] = summarizePerformerBuffer(b, 1_000 + 3 * MIN).rows
    expect(row).toEqual({
      user_id: 'user-1',
      performer_session_id: 'perf-1',
      entry_index: 0,
      song_id: 'song-7',
      song_source: 'catalog',
      song_title: 'Song 7',
      song_tags: ['Slow'],
      song_key: 'Bb',
      setlist_id: 'set-1',
      live_session_id: null,
      played_at: new Date(1_000).toISOString(),
      utc_offset_minutes: -300,
    })
  })

  it('an orphan closed at its last save point invents no extra time', () => {
    let b = describeEntry(showEntry(buffer(), 0, 0), 0, song(0))
    b = { ...b, savedAt: 3 * MIN, current: { index: 0, since: 0 } }
    expect(summarizePerformerBuffer(b, b.savedAt).activeMs).toBe(3 * MIN)
  })

  it('reads the opt-out from users.preferences, defaulting to on', () => {
    expect(songStatsEnabledFromPreferences(null)).toBe(true)
    expect(songStatsEnabledFromPreferences({ sprite: 'dove' })).toBe(true)
    expect(songStatsEnabledFromPreferences({ song_stats_enabled: false })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Recorder: offline queue, idempotency, opt-out, orphans, opens, counters
// ---------------------------------------------------------------------------

type Call = { kind: string; table?: string; rows?: unknown[]; opts?: unknown; fn?: string; args?: unknown }

function fakeClient() {
  const calls: Call[] = []
  const state = { status: 201 as number, error: null as unknown }
  const respond = () => Promise.resolve({ error: state.error, status: state.status })
  const client = {
    from(table: string) {
      return {
        upsert(rows: unknown[], opts: unknown) {
          calls.push({ kind: 'upsert', table, rows, opts })
          return respond()
        },
      }
    },
    rpc(fn: string, args?: unknown) {
      calls.push({ kind: 'rpc', fn, args })
      return fn === 'clear_my_song_stats'
        ? Promise.resolve({ data: { plays: 3, opens: 1 }, error: null, status: 200 })
        : respond()
    },
  }
  const offline = () => {
    state.status = 0
    state.error = { message: 'TypeError: Network request failed' }
  }
  const online = () => {
    state.status = 201
    state.error = null
  }
  const reject = () => {
    state.status = 403
    state.error = { code: '42501', message: 'row-level security' }
  }
  return { client: client as never, calls, offline, online, reject }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => void data.set(k, v),
    removeItem: async (k: string) => void data.delete(k),
  }
}

function setup(opts: { storage?: ReturnType<typeof memoryStorage> } = {}) {
  const net = fakeClient()
  const storage = opts.storage ?? memoryStorage()
  const clock = { t: Date.UTC(2026, 10, 1, 18, 0) }
  let n = 0
  const rec = createSongStatsRecorder({
    client: net.client,
    storage,
    now: () => clock.t,
    uuid: () => `perf-${++n}`,
    setInterval: () => 0,
    clearInterval: () => {},
  })
  return { rec, net, storage, clock }
}

const settle = () => new Promise((r) => setTimeout(r, 0))
const plays = (calls: Call[]) => calls.filter((c) => c.table === 'song_plays')

describe('song stats recorder', () => {
  async function performSet(env: ReturnType<typeof setup>, minutes = 3) {
    const tr = env.rec.startPerformer({ userId: 'user-1', setlistId: 'set-1' })
    tr.show(0)
    tr.describe(0, song(0))
    env.clock.t += minutes * MIN
    tr.end()
    await env.rec.flush()
  }

  it('writes one batched insert per qualifying set, deduped on retry', async () => {
    const env = setup()
    await env.rec.start()
    await performSet(env)
    const sent = plays(env.net.calls)
    expect(sent).toHaveLength(1)
    expect(sent[0].rows).toHaveLength(1)
    expect(sent[0].opts).toEqual({
      onConflict: 'user_id,performer_session_id,entry_index',
      ignoreDuplicates: true,
    })
    // Already sent → nothing left to resend.
    await env.rec.flush()
    expect(plays(env.net.calls)).toHaveLength(1)
  })

  it('writes nothing for a set that does not qualify', async () => {
    const env = setup()
    await env.rec.start()
    await performSet(env, 1)
    expect(plays(env.net.calls)).toHaveLength(0)
  })

  it('queues a set run offline and sends it once the network returns', async () => {
    const env = setup()
    await env.rec.start()
    env.net.offline()
    await performSet(env)
    expect(plays(env.net.calls)).toHaveLength(1) // attempted, failed
    env.net.online()
    await env.rec.flush()
    const sent = plays(env.net.calls)
    expect(sent).toHaveLength(2)
    // Same rows (same performer_session_id) → the server-side PK dedupes if the
    // first attempt had in fact landed.
    expect(sent[1].rows).toEqual(sent[0].rows)
    await env.rec.flush()
    expect(plays(env.net.calls)).toHaveLength(2)
  })

  it('survives a restart while queued offline', async () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    await first.rec.start()
    first.net.offline()
    await performSet(first)
    await settle()
    const second = setup({ storage })
    await second.rec.start()
    expect(plays(second.net.calls)).toHaveLength(1)
    expect(plays(second.net.calls)[0].rows).toHaveLength(1)
  })

  it('drops a batch the server permanently refuses instead of retrying forever', async () => {
    const env = setup()
    await env.rec.start()
    env.net.reject()
    await performSet(env)
    env.net.online()
    await env.rec.flush()
    expect(plays(env.net.calls)).toHaveLength(1)
  })

  it('logs a set the app died in the middle of, on next launch', async () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    await first.rec.start()
    const tr = first.rec.startPerformer({ userId: 'user-1', setlistId: 'set-1' })
    tr.show(0)
    tr.describe(0, song(0))
    first.clock.t += 3 * MIN
    tr.show(1) // a song change saves the buffer at that moment
    await settle()
    // Force-quit: no end(), no flush. Relaunch.
    const second = setup({ storage })
    await second.rec.start()
    const sent = plays(second.net.calls)
    expect(sent).toHaveLength(1)
    expect((sent[0].rows as Array<{ song_id: string }>).map((r) => r.song_id)).toEqual(['song-0'])
    expect(storage.data.has(SONG_STATS_STORAGE_KEYS.performer)).toBe(false)
  })

  it('opted out: nothing is buffered on the device and nothing is sent', async () => {
    const env = setup()
    await env.rec.start()
    env.rec.setEnabled('user-1', false)
    const tr = env.rec.startPerformer({ userId: 'user-1' })
    tr.show(0)
    tr.describe(0, song(0))
    env.clock.t += 5 * MIN
    tr.end()
    env.rec.recordOpen({ userId: 'user-1', songId: 'song-0', source: 'catalog', openedAt: env.clock.t })
    env.rec.countFeature('tuner', 'user-1')
    await env.rec.flush()
    await settle()
    expect(env.net.calls).toEqual([])
    expect(env.storage.data.has(SONG_STATS_STORAGE_KEYS.performer)).toBe(false)
  })

  it('turning off mid-set discards that set', async () => {
    const env = setup()
    await env.rec.start()
    const tr = env.rec.startPerformer({ userId: 'user-1' })
    tr.show(0)
    tr.describe(0, song(0))
    env.clock.t += 5 * MIN
    env.rec.setEnabled('user-1', false)
    tr.end()
    await env.rec.flush()
    expect(plays(env.net.calls)).toHaveLength(0)
  })

  it('no signed-in user: nothing is recorded', async () => {
    const env = setup()
    await env.rec.start()
    const tr = env.rec.startPerformer({ userId: null })
    tr.show(0)
    env.clock.t += 5 * MIN
    tr.end()
    env.rec.countFeature('tuner', null)
    await env.rec.flush()
    expect(env.net.calls).toEqual([])
  })

  it('debounces song opens to one per song per hour', async () => {
    const env = setup()
    await env.rec.start()
    const open = (songId: string) =>
      env.rec.recordOpen({ userId: 'user-1', songId, source: 'catalog', openedAt: env.clock.t })
    open('a')
    await env.rec.flush()
    env.clock.t += 20 * MIN
    open('a') // same hour → ignored
    open('b')
    await env.rec.flush()
    env.clock.t += SONG_STATS_RULES.openDebounceMs
    open('a')
    await env.rec.flush()
    const sentSongs = env.net.calls
      .filter((c) => c.table === 'song_opens')
      .flatMap((c) => (c.rows as Array<{ song_id: string }>).map((r) => r.song_id))
    expect(sentSongs).toEqual(['a', 'b', 'a'])
  })

  it('aggregates feature uses per day and sends no user data', async () => {
    const env = setup()
    await env.rec.start()
    env.rec.countFeature('tuner', 'user-1')
    env.rec.countFeature('tuner', 'user-1')
    env.rec.countFeature('metronome', 'user-1')
    await env.rec.flush()
    const rpcs = env.net.calls.filter((c) => c.fn === 'record_feature_use')
    // The device's local calendar day, whatever timezone the test runs in.
    const d = new Date(env.clock.t)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(rpcs.map((c) => c.args)).toEqual([
      { p_feature: 'tuner', p_day: day, p_count: 2 },
      { p_feature: 'metronome', p_day: day, p_count: 1 },
    ])
  })

  it('clear my history empties the device and calls the server', async () => {
    const env = setup()
    await env.rec.start()
    env.net.offline()
    await performSet(env)
    env.net.online()
    const result = await env.rec.clearHistory()
    expect(result).toEqual({ plays: 3, opens: 1 })
    await env.rec.flush()
    // The queued set was dropped locally, not sent after the clear.
    expect(plays(env.net.calls)).toHaveLength(1)
  })

  it('a use counted during launch does not overwrite the stored queue', async () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    await first.rec.start()
    first.net.offline()
    await performSet(first)
    await settle()
    const second = setup({ storage })
    second.rec.countFeature('tuner', 'user-1') // before start()/hydrate
    await second.rec.start()
    expect(plays(second.net.calls)).toHaveLength(1)
    expect(second.net.calls.some((c) => c.fn === 'record_feature_use')).toBe(true)
  })
})
