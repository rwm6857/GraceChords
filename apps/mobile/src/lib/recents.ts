import type { Song } from './useSongList'
import type { KVStorage } from './defaults'

// Local-history accessor for Home's "Continue where you left off" card. Backed
// by an on-device history of opened songs (the Viewer records opens via
// recordSongOpened). Device-local (AsyncStorage), NOT Supabase-synced.
//
// Follows the defaults.ts pattern: storage is INJECTED and hydrated once at
// splash, after which getRecentlyOpened() is SYNCHRONOUS — Home reads it during
// render with no flash and no signature change.
//
// (The former getLastSet() stub was retired by the Setlist Builder — Home's
// "Last set" card now reads real Supabase data via src/lib/useLastSet.ts.)

/** Fields the Viewer has when a song loads (a SongDetail is a superset). */
export type RecentSongInput = {
  id: string
  slug: string
  title: string
  artist: string | null
  default_key: string | null
  time_signature?: string | null
  tempo?: number | null
}

type RecentRecord = Song & { openedAt: string }

const STORAGE_KEY = 'gc.recents.songs.v1'
const MAX_RECENTS = 20

let cache: RecentRecord[] = []
let storage: KVStorage | null = null

function toSong(input: RecentSongInput): Song {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    artist: input.artist ?? null,
    default_key: input.default_key ?? null,
    time_signature: input.time_signature ?? null,
    tempo: input.tempo ?? null,
    tags: null,
    created_at: null,
  }
}

function isRecentRecord(v: unknown): v is RecentRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.slug === 'string' && typeof r.title === 'string' && typeof r.openedAt === 'string'
}

function parse(raw: string | null): RecentRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentRecord).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

/**
 * Load stored history into the cache and remember `store` for write-through. A
 * bad read never crashes the app. Safe to call again to re-read from the same
 * storage (used to simulate a reload in tests).
 */
export async function hydrateRecents(store: KVStorage): Promise<Song[]> {
  storage = store
  try {
    cache = parse(await store.getItem(STORAGE_KEY))
  } catch {
    cache = []
  }
  return getRecentlyOpened()
}

/** Most-recently-opened songs, newest first. Synchronous — safe before hydrate. */
export function getRecentlyOpened(): Song[] {
  return cache.map(({ openedAt: _openedAt, ...song }) => song)
}

/**
 * Record a song open (call from the Viewer when a song loads). Moves an existing
 * entry to the front, caps the list, and persists write-through. The timestamp is
 * captured here (app context — Date is available, unlike in workflow scripts).
 */
export function recordSongOpened(input: RecentSongInput): void {
  if (!input?.slug) return
  const record: RecentRecord = { ...toSong(input), openedAt: new Date().toISOString() }
  cache = [record, ...cache.filter((r) => r.slug !== input.slug)].slice(0, MAX_RECENTS)
  storage?.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {})
}

/** Test-only reset so each test starts from a clean module state. */
export function __resetRecentsForTest(): void {
  cache = []
  storage = null
}
