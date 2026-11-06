// Made-up history for previewing the Song Stats screens before a real account
// has enough sets (dev builds and admins only — see each app's preview
// switch). Deterministic for a given `now`, and shaped so every section has
// something to show: a core rotation, songs that come and go, songs that
// have gone quiet, and recent additions. Never written anywhere.

import type { FetchedOpen, FetchedPlay } from './songStatsRepo'

const TITLES = [
  'Morning Light',
  'Grace Upon Grace',
  'Hallowed Ground',
  'River of Mercy',
  'Steadfast',
  'Lamp to My Feet',
  'Shepherd of My Soul',
  'All the Earth',
  'Cornerstone Hymn',
  'Before the Throne',
  'Faithful Still',
  'Open Heaven',
  'Wellspring',
  'Song of Ascent',
  'Unshaken',
  'Evening Psalm',
  'Name Above All',
  'New Every Morning',
  'Waters Rise',
  'Kingdom Come',
  'Here in the Quiet',
  'Crowned in Glory',
]

const DAY = 86_400_000
const id = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export function buildSampleSongStats(now: number): { plays: FetchedPlay[]; opens: FetchedOpen[] } {
  const rand = rng(7)
  const plays: FetchedPlay[] = []
  // 30 sets, one every 13 days, newest first.
  for (let s = 0; s < 30; s++) {
    const at = now - (s * 13 + 2) * DAY
    const pool: number[] = []
    // Core rotation: songs 0–3, almost every set.
    for (let i = 0; i < 4; i++) if (rand() < 0.8) pool.push(i)
    // Recent additions, only in the last ~3 months.
    if (s < 7) for (const i of [16, 17, 18]) if (rand() < 0.6) pool.push(i)
    // Older songs that have gone quiet: only sung 7+ months ago.
    if (s > 16) for (const i of [11, 12, 13, 14, 15]) if (rand() < 0.5) pool.push(i)
    // Everything else, now and then.
    for (const i of [4, 5, 6, 7, 8, 9, 10]) if (rand() < 0.3) pool.push(i)
    const songs = pool.sort(() => rand() - 0.5).slice(0, 4 + Math.floor(rand() * 3))
    songs.forEach((song, entry) => {
      plays.push({
        performer_session_id: `sample-${s}`,
        entry_index: entry,
        song_id: id(song),
        song_source: song === 10 ? 'personal' : 'catalog',
        song_title: TITLES[song],
        played_at: new Date(at + entry * 6 * 60_000).toISOString(),
        utc_offset_minutes: -new Date(at).getTimezoneOffset(),
      })
    })
  }
  const opens: FetchedOpen[] = []
  for (let i = 0; i < 90; i++) {
    const song = Math.floor(rand() ** 1.6 * TITLES.length)
    opens.push({
      song_id: id(song),
      song_source: song === 10 ? 'personal' : 'catalog',
      opened_at: new Date(now - Math.floor(rand() * 380) * DAY).toISOString(),
    })
  }
  return { plays, opens }
}

/**
 * Preview switches (dev builds and admins): show the screens below the gate,
 * and/or swap in the sample history. Persisted per device so a reload keeps
 * them; never synced.
 */
export type SongStatsPreview = { bypassGate: boolean; sample: boolean }

export const SONG_STATS_PREVIEW_STORAGE_KEY = 'gc.songStats.preview.v1'

export function createSongStatsPreviewStore(storage: {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}) {
  let state: SongStatsPreview = { bypassGate: true, sample: false }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((fn) => fn())
  void storage
    .getItem(SONG_STATS_PREVIEW_STORAGE_KEY)
    .then((raw) => {
      const p = raw ? (JSON.parse(raw) as Partial<SongStatsPreview>) : null
      if (p && typeof p.bypassGate === 'boolean' && typeof p.sample === 'boolean') {
        state = { bypassGate: p.bypassGate, sample: p.sample }
        emit()
      }
    })
    .catch(() => {})
  return {
    get: () => state,
    set(patch: Partial<SongStatsPreview>) {
      state = { ...state, ...patch }
      void storage.setItem(SONG_STATS_PREVIEW_STORAGE_KEY, JSON.stringify(state)).catch(() => {})
      emit()
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}
