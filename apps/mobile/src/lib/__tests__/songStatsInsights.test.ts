import { describe, expect, it, vi } from 'vitest'
import {
  SONG_STATS_INSIGHT_RULES as R,
  buildSampleSongStats,
  computeSongStats,
  createSongStatsDataSource,
  formatSongStatsDate,
  mergePendingPlays,
  playLocalDate,
  songKey,
  type FetchedPlay,
} from '@gracechords/core'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-05T12:00:00Z')

let seq = 0
function play(session: string, song: string, daysAgo: number, extra: Partial<FetchedPlay> = {}): FetchedPlay {
  return {
    performer_session_id: session,
    entry_index: seq++,
    song_id: song,
    song_source: 'catalog',
    song_title: `Title ${song}`,
    played_at: new Date(NOW - daysAgo * DAY).toISOString(),
    utc_offset_minutes: 0,
    ...extra,
  }
}

/** n sets, newest first, each `daysApart` apart, every set singing `songs`. */
function sets(n: number, songs: string[], daysApart = 7, startDaysAgo = 1): FetchedPlay[] {
  const out: FetchedPlay[] = []
  for (let i = 0; i < n; i++) for (const s of songs) out.push(play(`s${startDaysAgo}-${i}`, s, startDaysAgo + i * daysApart))
  return out
}

describe('computeSongStats — gate', () => {
  it('stays closed at 9 sets and opens at 10', () => {
    expect(computeSongStats({ plays: sets(9, ['a']), window: '12m', now: NOW }).gateMet).toBe(false)
    const ten = computeSongStats({ plays: sets(10, ['a']), window: '12m', now: NOW })
    expect(ten.gateMet).toBe(true)
    expect(ten.totalSessions).toBe(R.gateSessions)
  })

  it('counts sets all time, not just inside the window', () => {
    const plays = [...sets(5, ['a'], 7, 1), ...sets(5, ['a'], 7, 200)]
    const s = computeSongStats({ plays, window: '3m', now: NOW })
    expect(s.totalSessions).toBe(10)
    expect(s.gateMet).toBe(true)
    expect(s.summary.sessions).toBe(5)
  })
})

describe('computeSongStats — summary', () => {
  it('counts sets, distinct songs, songs per set and new songs in the window', () => {
    const plays = [
      ...sets(2, ['old'], 7, 400), // first sung long ago
      play('x1', 'old', 10),
      play('x1', 'new1', 10),
      play('x1', 'new2', 10),
      play('x2', 'old', 3),
    ]
    const s = computeSongStats({ plays, window: '12m', now: NOW })
    expect(s.summary).toEqual({ sessions: 2, distinctSongs: 3, avgSongsPerSet: 2, newSongs: 2 })
    expect(s.newThisPeriod.map((x) => x.songId).sort()).toEqual(['new1', 'new2'])
  })

  it('has no "new" figure for all time', () => {
    const s = computeSongStats({ plays: sets(3, ['a', 'b']), window: 'all', now: NOW })
    expect(s.summary.newSongs).toBeNull()
    expect(s.newThisPeriod).toEqual([])
    expect(s.summary.avgSongsPerSet).toBe(2)
  })

  it('rounds songs per set to one decimal', () => {
    const plays = [play('a', '1', 1), play('a', '2', 1), play('b', '1', 2), play('c', '1', 3)]
    expect(computeSongStats({ plays, window: '12m', now: NOW }).summary.avgSongsPerSet).toBe(1.3)
  })

  it('has a one-month window', () => {
    const plays = [play('a', '1', 10), play('b', '2', 40)]
    expect(computeSongStats({ plays, window: '1m', now: NOW }).summary.sessions).toBe(1)
  })

  it('returns a null average with nothing in the window', () => {
    const s = computeSongStats({ plays: sets(2, ['a'], 7, 200), window: '3m', now: NOW })
    expect(s.summary.avgSongsPerSet).toBeNull()
    expect(s.summary.sessions).toBe(0)
  })
})

describe('computeSongStats — most sung and most opened', () => {
  it('ranks by count and breaks ties by most recent', () => {
    const plays = [play('1', 'a', 30), play('2', 'a', 20), play('3', 'b', 25), play('4', 'b', 5), play('5', 'c', 1)]
    const s = computeSongStats({ plays, window: '12m', now: NOW })
    expect(s.mostSung.map((x) => [x.songId, x.count])).toEqual([
      ['b', 2],
      ['a', 2],
      ['c', 1],
    ])
  })

  it('keeps opens out of Most sung and plays out of Most opened', () => {
    const plays = [play('1', 'sung', 1)]
    const opens = [
      { song_id: 'studied', song_source: 'catalog' as const, opened_at: new Date(NOW - DAY).toISOString() },
      { song_id: 'studied', song_source: 'catalog' as const, opened_at: new Date(NOW - 2 * DAY).toISOString() },
    ]
    const s = computeSongStats({ plays, opens, window: '12m', now: NOW })
    expect(s.mostSung.map((x) => x.songId)).toEqual(['sung'])
    expect(s.mostOpened?.map((x) => [x.songId, x.count])).toEqual([['studied', 2]])
  })

  it('is null when opens were not loaded', () => {
    expect(computeSongStats({ plays: [], window: '12m', now: NOW }).mostOpened).toBeNull()
  })

  it('caps both lists', () => {
    const plays = Array.from({ length: 15 }, (_, i) => play(`s${i}`, `song${i}`, i + 1))
    expect(computeSongStats({ plays, window: '12m', now: NOW }).mostSung).toHaveLength(R.topSongs)
  })
})

describe('computeSongStats — titles', () => {
  it('uses the current title where the song still resolves, else the latest snapshot', () => {
    const plays = [
      play('1', 'renamed', 20, { song_title: 'Old Name' }),
      play('2', 'deleted', 10, { song_title: 'Gone Song' }),
      play('3', 'deleted', 5, { song_title: 'Gone Song v2' }),
    ]
    const s = computeSongStats({
      plays,
      window: '12m',
      now: NOW,
      titles: { [songKey('catalog', 'renamed')]: 'New Name' },
    })
    const byId = Object.fromEntries(s.mostSung.map((x) => [x.songId, x.title]))
    expect(byId).toEqual({ renamed: 'New Name', deleted: 'Gone Song v2' })
  })

  it('keeps a catalog song and a personal song with the same id apart', () => {
    const plays = [play('1', 'same', 1), play('1', 'same', 1, { song_source: 'personal' })]
    expect(computeSongStats({ plays, window: '12m', now: NOW }).summary.distinctSongs).toBe(2)
  })
})

describe('computeSongStats — repeat rate and heavy rotation', () => {
  it('needs 16 sets for a repeat rate', () => {
    expect(computeSongStats({ plays: sets(15, ['a']), window: 'all', now: NOW }).repeatRate).toBeNull()
    expect(computeSongStats({ plays: sets(16, ['a']), window: 'all', now: NOW }).repeatRate).toBe(100)
  })

  it('is the share of the last 8 sets’ songs that were in the 8 before', () => {
    // Last 8 sets sing a, b, c, d; the 8 before sing a and z.
    const plays = [...sets(8, ['a', 'b', 'c', 'd'], 7, 1), ...sets(8, ['a', 'z'], 7, 60)]
    expect(computeSongStats({ plays, window: 'all', now: NOW }).repeatRate).toBe(25)
  })

  it('lists songs in at least 5 of the last 8 sets', () => {
    const plays: FetchedPlay[] = []
    for (let i = 0; i < 8; i++) {
      plays.push(play(`r${i}`, 'every', i + 1))
      if (i < 5) plays.push(play(`r${i}`, 'five', i + 1))
      if (i < 4) plays.push(play(`r${i}`, 'four', i + 1))
    }
    const s = computeSongStats({ plays, window: '12m', now: NOW })
    expect(s.heavyRotation.map((x) => [x.songId, x.sets, x.of])).toEqual([
      ['every', 8, 8],
      ['five', 5, 8],
    ])
  })
})

describe('computeSongStats — resting and long-time songs', () => {
  it('lists songs not sung in 180 days, most recently sung first, capped', () => {
    const plays = [
      play('1', 'recent', 10),
      play('2', 'rest-a', 200),
      play('3', 'rest-b', 300),
      play('4', 'rest-a', 400),
    ]
    const s = computeSongStats({ plays, window: '12m', now: NOW })
    expect(s.resting.map((x) => x.songId)).toEqual(['rest-a', 'rest-b'])
    expect(s.resting[0].lastSung).toBe(playLocalDate(plays[1]))

    const many = Array.from({ length: 20 }, (_, i) => play(`m${i}`, `old${i}`, 200 + i))
    expect(computeSongStats({ plays: many, window: 'all', now: NOW }).resting).toHaveLength(R.dormantMax)
  })

  it('lists songs sung since early on that are still in use', () => {
    const plays = [
      play('1', 'veteran', 500),
      play('2', 'veteran', 20),
      play('3', 'newer', 30),
      play('4', 'retired', 600),
    ]
    const s = computeSongStats({ plays, window: '12m', now: NOW })
    expect(s.longTime.map((x) => x.songId)).toEqual(['veteran'])
  })
})

describe('local dates', () => {
  it('puts a Sunday 6pm set on Sunday wherever the reader is', () => {
    // Sunday 2026-11-01 18:00 in New York (UTC-5) is Monday 00:00 UTC.
    const p = { played_at: '2026-11-01T23:00:00Z', utc_offset_minutes: -300 }
    expect(playLocalDate(p)).toBe('2026-11-01')
    expect(new Date('2026-11-01T00:00:00Z').getUTCDay()).toBe(0)
    expect(formatSongStatsDate('2026-11-01', 'en', NOW)).toBe('Nov 1')
    expect(formatSongStatsDate('2025-08-02', 'en', NOW)).toBe('Aug 2, 2025')
  })
})

describe('mergePendingPlays', () => {
  it('adds pending sets without duplicating ones already fetched', () => {
    const fetched = [play('s1', 'a', 1, { entry_index: 0 })]
    const pending = [play('s1', 'a', 1, { entry_index: 0 }), play('s2', 'b', 0, { entry_index: 0 })]
    expect(mergePendingPlays(fetched, pending).map((p) => p.performer_session_id)).toEqual(['s1', 's2'])
  })
})

describe('createSongStatsDataSource', () => {
  function setup(rows: FetchedPlay[]) {
    let now = NOW
    const store = new Map<string, string>()
    const storage = {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    }
    const range = vi.fn(async () => ({ data: rows, error: null }))
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'gte']) chain[m] = () => chain
    chain.range = range
    chain.in = async () => ({ data: [], error: null })
    const client = { from: () => chain } as never
    let notify = () => {}
    let pending: FetchedPlay[] = []
    const recorder = {
      pendingPlays: async () => pending as never,
      subscribe: (fn: () => void) => {
        notify = fn
        return () => {}
      },
    }
    const source = createSongStatsDataSource({ client, storage, recorder, now: () => now })
    return {
      source,
      range,
      store,
      tick: (ms: number) => (now += ms),
      notify: () => notify(),
      setPending: (p: FetchedPlay[]) => (pending = p),
    }
  }

  it('fetches once and serves the cache for 24 hours', async () => {
    const h = setup([play('s1', 'a', 1)])
    await h.source.loadPlays('u1')
    await h.source.loadPlays('u1')
    expect(h.range).toHaveBeenCalledTimes(1)
    h.tick(25 * 60 * 60 * 1000)
    await h.source.loadPlays('u1')
    expect(h.range).toHaveBeenCalledTimes(2)
  })

  it('refetches after the recorder reports a change, and drops the stored copy', async () => {
    const h = setup([play('s1', 'a', 1)])
    await h.source.loadPlays('u1')
    expect(h.store.size).toBe(1)
    h.notify()
    expect(h.store.size).toBe(0)
    await h.source.loadPlays('u1')
    expect(h.range).toHaveBeenCalledTimes(2)
  })

  it('never serves one account’s cache to another', async () => {
    const h = setup([play('s1', 'a', 1)])
    await h.source.loadPlays('u1')
    await h.source.loadPlays('u2')
    expect(h.range).toHaveBeenCalledTimes(2)
  })

  it('includes sets still waiting to upload', async () => {
    const h = setup([play('s1', 'a', 1, { entry_index: 0 })])
    h.setPending([play('offline', 'b', 0, { entry_index: 0 })])
    const data = await h.source.loadPlays('u1')
    expect(data.plays.map((p) => p.performer_session_id)).toEqual(['s1', 'offline'])
  })
})

describe('buildSampleSongStats', () => {
  it('fills every section', () => {
    const { plays, opens } = buildSampleSongStats(NOW)
    const s = computeSongStats({ plays, opens, window: '12m', now: NOW })
    expect(s.gateMet).toBe(true)
    expect(s.repeatRate).not.toBeNull()
    expect(s.mostSung.length).toBeGreaterThan(0)
    expect(s.mostOpened?.length).toBeGreaterThan(0)
    expect(s.newThisPeriod.length).toBeGreaterThan(0)
    expect(s.heavyRotation.length).toBeGreaterThan(0)
    expect(s.resting.length).toBeGreaterThan(0)
    expect(s.longTime.length).toBeGreaterThan(0)
  })
})
