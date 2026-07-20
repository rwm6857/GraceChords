// Platform-agnostic live-session queries + Realtime subscription.
//
// A live "Session" lets a native leader broadcast their current setlist item +
// transpose to web followers in real time. ONE `sessions` row is the single
// source of truth: the late-join snapshot and the live stream both come from it.
// Callers inject the Supabase client created via createGcSupabase() (same
// convention as setlistsRepo/songsRepo). Errors throw; callers catch.
//
// The row carries its own frozen `items` snapshot (built at session start via
// buildSnapshot) because (a) setlist_songs is persisted wipe-and-replace so its
// row ids are not durable, and (b) setlists are owner-scoped by RLS so an anon
// follower cannot read the setlist. The stable "current item" pointer is
// items[].uid, mirrored into current_item_uid. Public songs are referenced by
// slug (followers resolve lyrics from the public catalog); personal songs and
// bible verses are recorded as { kind: 'unavailable' } placeholders in phase 1.

import { isVerseId } from '../songs/verseRef.js'
import { generateSessionCode } from './sessionCode.js'

const CREATE_MAX_RETRIES = 5 // code-collision retries against the UNIQUE index

/**
 * @typedef {Object} SnapshotItem
 * @property {string} uid            Stable per-snapshot id (index-derived).
 * @property {'song'|'unavailable'} kind
 * @property {string} title
 * @property {string} [slug]         Public-song slug (kind === 'song').
 * @property {string|null} [defaultKey] Song's native key (kind === 'song').
 * @property {string|null} [toKey]   Setlist-scoped key override, if any.
 * @property {'personal'|'verse'} [reason] Why an item is unavailable.
 */

/**
 * Build the frozen item snapshot from an ordered list of builder/performer
 * entries. Order is preserved 1:1 with the input so the leader's local index
 * maps directly to snapshot[index].uid. Public catalog songs become renderable
 * references; personal songs (`personal:<uuid>`) and bible verses (`v:...`) are
 * recorded as placeholders the follower shows as "not available in this view".
 *
 * @param {Array<{ songId: string, toKey?: string|null, song?: { slug?: string, title?: string, default_key?: string|null }|null }>} entries
 * @returns {SnapshotItem[]}
 */
export function buildSnapshot(entries = []) {
  return entries.map((entry, i) => {
    const uid = `i${i}`
    const songId = entry && entry.songId
    const song = (entry && entry.song) || null
    const title = (song && song.title) || 'Untitled'
    if (isVerseId(songId)) {
      return { uid, kind: 'unavailable', title, reason: 'verse' }
    }
    if (typeof songId === 'string' && songId.startsWith('personal:')) {
      return { uid, kind: 'unavailable', title, reason: 'personal' }
    }
    const slug = song && song.slug ? song.slug : null
    if (!slug) {
      // No public slug to resolve lyrics from — treat as unavailable rather than
      // ship a reference the follower can't render.
      return { uid, kind: 'unavailable', title, reason: 'personal' }
    }
    return {
      uid,
      kind: 'song',
      slug,
      title,
      defaultKey: (song && song.default_key) || null,
      toKey: (entry && entry.toKey) || null,
    }
  })
}

/**
 * Create a fresh live session owned by the current user. Retries on code
 * collision against the UNIQUE index. The caller supplies the frozen snapshot
 * (see buildSnapshot) and the initial current item.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ setlistId?: string|null, items: SnapshotItem[], currentItemUid?: string|null, transpose?: number, currentKey?: string|null }} input
 * @returns {Promise<{ id: string, code: string, status: string, setlist_id: string|null, items: SnapshotItem[], current_item_uid: string|null, transpose: number, current_key: string|null }>}
 */
export async function createSession(client, input = {}) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) throw authError || new Error('Not authenticated')

  const items = input.items || []
  const base = {
    controller_id: user.id,
    setlist_id: input.setlistId || null,
    status: 'live',
    items,
    current_item_uid:
      input.currentItemUid || (items.length ? items[0].uid : null),
    transpose: input.transpose || 0,
    current_key: input.currentKey || null,
  }

  let lastError = null
  for (let attempt = 0; attempt < CREATE_MAX_RETRIES; attempt += 1) {
    const row = { ...base, code: generateSessionCode() }
    const { data, error } = await client
      .from('sessions')
      .insert(row)
      .select('id, code, status, setlist_id, items, current_item_uid, transpose, current_key')
      .single()
    if (!error) return data
    // 23505 = unique_violation (duplicate code). Anything else is fatal.
    if (error.code === '23505') {
      lastError = error
      continue
    }
    throw error
  }
  throw lastError || new Error('Could not allocate a unique session code')
}

/**
 * Broadcast a song change: set the current item and its transpose/key in one
 * write. Bumps last_active_at so the cleanup TTL treats the session as alive.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} sessionId
 * @param {{ itemUid: string, transpose?: number, currentKey?: string|null }} input
 */
export async function updateCurrentItem(client, sessionId, input = {}) {
  const { error } = await client
    .from('sessions')
    .update({
      current_item_uid: input.itemUid,
      transpose: input.transpose || 0,
      current_key: input.currentKey || null,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
  if (error) throw error
}

/**
 * Broadcast a transpose change for the current item.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} sessionId
 * @param {{ transpose: number, currentKey?: string|null }} input
 */
export async function updateTranspose(client, sessionId, input = {}) {
  const { error } = await client
    .from('sessions')
    .update({
      transpose: input.transpose || 0,
      current_key: input.currentKey || null,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
  if (error) throw error
}

/**
 * Heartbeat: bump last_active_at so a long, quiet session isn't reaped by the
 * inactivity TTL.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} sessionId
 */
export async function touchSession(client, sessionId) {
  const { error } = await client
    .from('sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}

/**
 * End a session (status = 'ended'). Followers show the end screen; the cleanup
 * worker deletes ended rows.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} sessionId
 */
export async function endSession(client, sessionId) {
  const { error } = await client
    .from('sessions')
    .update({ status: 'ended', last_active_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}

/**
 * @typedef {Object} SessionRow
 * @property {string} id
 * @property {string} code
 * @property {'live'|'ended'} status
 * @property {string|null} setlist_id
 * @property {SnapshotItem[]} items
 * @property {string|null} current_item_uid
 * @property {number} transpose
 * @property {string|null} current_key
 * @property {string} [updated_at]
 * @property {string} [last_active_at]
 */

/**
 * Fetch a single session by its share code (the follower's late-join snapshot).
 * Returns null when no such code exists.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} code
 * @returns {Promise<SessionRow|null>}
 */
export async function fetchSessionByCode(client, code) {
  const { data, error } = await client
    .from('sessions')
    .select('id, code, status, setlist_id, items, current_item_uid, transpose, current_key, updated_at, last_active_at')
    .eq('code', code)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Find the current user's most recent live session, if any — used by the native
 * leader to offer "resume session?" on relaunch. Returns null when none.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<SessionRow|null>}
 */
export async function fetchActiveSessionForController(client) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) return null
  const { data, error } = await client
    .from('sessions')
    .select('id, code, status, setlist_id, items, current_item_uid, transpose, current_key, updated_at')
    .eq('controller_id', user.id)
    .eq('status', 'live')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Subscribe to a session row via Supabase Realtime (postgres_changes). Fires
 * onChange with the new row on every UPDATE, and onStatus with the channel
 * lifecycle status (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED) so the
 * follower can drive its reconnect/grace-window UX. Returns an unsubscribe fn.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} sessionId
 * @param {{ onChange?: (row: Object) => void, onStatus?: (status: string) => void }} handlers
 * @returns {() => void} unsubscribe
 */
export function subscribeToSession(client, sessionId, handlers = {}) {
  const { onChange, onStatus } = handlers
  const channel = client
    .channel(`session:${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      (payload) => {
        if (onChange && payload && payload.new) onChange(payload.new)
      },
    )
    .subscribe((status) => {
      if (onStatus) onStatus(status)
    })
  return () => {
    try {
      client.removeChannel(channel)
    } catch {
      /* channel already torn down */
    }
  }
}
