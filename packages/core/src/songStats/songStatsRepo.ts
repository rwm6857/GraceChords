// Song Stats server calls. Client-injected like the other repos; unlike them,
// these return `{ ok, permanent }` instead of throwing, because the only caller
// is the offline outbox and it needs to know whether a failure is worth
// retrying (no signal, server hiccup) or never will succeed (RLS refused,
// table not migrated, row rejected by a CHECK).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlayRow, SongSource } from './performerSession'
import type { SongStatsFeature } from './rules'
import { SONG_STATS_PREF_KEY, songStatsEnabledFromPreferences } from './rules'

export type OpenRow = {
  user_id: string
  song_id: string
  song_source: SongSource
  opened_at: string
}

export type SendResult = { ok: true } | { ok: false; permanent: boolean }

type Resp = { error: unknown; status?: number }

/**
 * postgrest-js reports a network failure as status 0. 5xx, 408 and 429 are the
 * server's problem and pass; 401 is an expired token the next refresh fixes.
 * Every other 4xx is a request the server will refuse again.
 */
export function classifyResponse(resp: Resp): SendResult {
  if (!resp.error) return { ok: true }
  const status = typeof resp.status === 'number' ? resp.status : 0
  const transient = status === 0 || status >= 500 || status === 401 || status === 408 || status === 429
  return { ok: false, permanent: !transient }
}

async function call(run: () => PromiseLike<Resp>): Promise<SendResult> {
  try {
    return classifyResponse(await run())
  } catch {
    return { ok: false, permanent: false }
  }
}

/** Insert a whole performer session. A retried batch is ignored, not duplicated. */
export function insertSongPlays(client: SupabaseClient, rows: PlayRow[]): Promise<SendResult> {
  if (rows.length === 0) return Promise.resolve({ ok: true })
  return call(() =>
    client.from('song_plays').upsert(rows, {
      onConflict: 'user_id,performer_session_id,entry_index',
      ignoreDuplicates: true,
    }),
  )
}

/** Insert song-viewer opens. A second open in the same UTC hour is ignored. */
export function insertSongOpens(client: SupabaseClient, rows: OpenRow[]): Promise<SendResult> {
  if (rows.length === 0) return Promise.resolve({ ok: true })
  return call(() =>
    client.from('song_opens').upsert(rows, {
      onConflict: 'user_id,song_id,opened_hour',
      ignoreDuplicates: true,
    }),
  )
}

/** Add `count` uses of a feature on a device-local day. Anonymous. */
export function recordFeatureUse(
  client: SupabaseClient,
  feature: SongStatsFeature,
  day: string,
  count: number,
): Promise<SendResult> {
  return call(() => client.rpc('record_feature_use', { p_feature: feature, p_day: day, p_count: count }))
}

/** "Clear my history": deletes every play and open row for the caller. Throws. */
export async function clearMySongStats(client: SupabaseClient): Promise<{ plays: number; opens: number }> {
  const { data, error } = await client.rpc('clear_my_song_stats')
  if (error) throw error
  const d = (data || {}) as { plays?: number; opens?: number }
  return { plays: d.plays ?? 0, opens: d.opens ?? 0 }
}

/** Read the opt-out. Throws on a failed read so callers keep their cached value. */
export async function fetchSongStatsEnabled(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from('users').select('preferences').eq('id', userId).maybeSingle()
  if (error) throw error
  return songStatsEnabledFromPreferences(data?.preferences)
}

/**
 * Turn Song Stats on or off for this account. Read-merge-write so other
 * preference keys (sprite, ui_language) are never clobbered — the same shape
 * as the sprite and language writers. Throws.
 */
export async function saveSongStatsEnabled(
  client: SupabaseClient,
  userId: string,
  enabled: boolean,
): Promise<void> {
  const { data: row, error: readError } = await client
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()
  if (readError) throw readError
  const preferences = { ...((row?.preferences as Record<string, unknown>) ?? {}), [SONG_STATS_PREF_KEY]: enabled }
  const { data: updated, error } = await client
    .from('users')
    .update({ preferences })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  if (!updated || updated.length === 0) throw new Error('Profile row not found or not writable.')
}

// ── Reads for the Song Stats screens. These throw, like the other repos. ──

export type FetchedPlay = {
  performer_session_id: string
  entry_index: number
  song_id: string
  song_source: SongSource
  song_title: string
  played_at: string
  utc_offset_minutes: number
}

export type FetchedOpen = { song_id: string; song_source: SongSource; opened_at: string }

// PostgREST caps a response at 1000 rows by default; page until a short page.
const PAGE = 1000

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** Every play row this user has (RLS allows only their own). */
export function fetchMySongPlays(client: SupabaseClient, userId: string): Promise<FetchedPlay[]> {
  return fetchAllPages<FetchedPlay>((from, to) =>
    client
      .from('song_plays')
      .select('performer_session_id, entry_index, song_id, song_source, song_title, played_at, utc_offset_minutes')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .order('performer_session_id', { ascending: true })
      .order('entry_index', { ascending: true })
      .range(from, to),
  )
}

/** This user's song-viewer opens since `sinceIso` (all of them when null). */
export function fetchMySongOpens(
  client: SupabaseClient,
  userId: string,
  sinceIso: string | null,
): Promise<FetchedOpen[]> {
  return fetchAllPages<FetchedOpen>((from, to) => {
    let q = client.from('song_opens').select('song_id, song_source, opened_at').eq('user_id', userId)
    if (sinceIso) q = q.gte('opened_at', sinceIso)
    return q
      .order('opened_at', { ascending: false })
      .order('song_id', { ascending: true })
      .range(from, to)
  })
}

const TITLE_CHUNK = 100

/**
 * Current titles for songs that still exist, keyed `${source}:${id}`. A song
 * that was deleted (or a personal song that isn't the caller's) is simply
 * absent, and the screens fall back to the title stored on the play row.
 * Best-effort: a failed chunk is skipped rather than failing the screen.
 */
export async function fetchSongTitles(
  client: SupabaseClient,
  refs: Array<{ songId: string; source: SongSource }>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const tables: Array<[SongSource, string]> = [
    ['catalog', 'songs'],
    ['personal', 'personal_songs'],
  ]
  for (const [source, table] of tables) {
    const ids = [...new Set(refs.filter((r) => r.source === source).map((r) => r.songId))]
    for (let i = 0; i < ids.length; i += TITLE_CHUNK) {
      try {
        const { data, error } = await client
          .from(table)
          .select('id, title')
          .in('id', ids.slice(i, i + TITLE_CHUNK))
        if (error) continue
        for (const row of (data as Array<{ id: string; title: string | null }> | null) ?? []) {
          if (row.title) out[`${source}:${row.id}`] = row.title
        }
      } catch {
        // Offline mid-way: keep what we have.
      }
    }
  }
  return out
}
