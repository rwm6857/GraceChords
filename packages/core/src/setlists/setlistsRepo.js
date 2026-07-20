// Platform-agnostic setlist queries (new setlists + setlist_songs schema).
//
// This is the canonical, client-injected counterpart to the web-side module at
// apps/web/src/hooks/useSetlists.js — same semantics (personal sets only,
// wipe-and-replace updates where position = array index), but callers inject
// the Supabase client created via createGcSupabase(), like songsRepo. Errors
// throw (songsRepo convention); callers catch. The per-entry setlist-scoped
// key lives in setlist_songs.key_override and is exposed app-side as `toKey`.

import { isVerseId } from '../songs/verseRef.js'

/**
 * Fetch all personal (team_id IS NULL) setlists for the current user,
 * sorted by updated_at DESC, with a song count via the relationship.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<Array<{ id: string, name: string, service_date: string|null, created_at: string, updated_at: string, setlist_songs: Array<{ count: number }> }>>}
 */
export async function fetchPersonalSetlists(client) {
  const { data, error } = await client
    .from('setlists')
    .select('id, name, service_date, created_at, updated_at, setlist_songs(count)')
    .is('team_id', null)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Fetch one setlist's metadata plus its ordered entries.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} setlistId
 * @returns {Promise<{ id: string, name: string, service_date: string|null, updated_at: string, entries: Array<{ id: string, song_id: string, position: number, toKey: string|null, notes: string|null, song: { slug: string, title: string, artist: string|null, default_key: string|null, tempo: number|null, time_signature: string|null }|null }> }|null>}
 */
// The personal_songs table / setlist_songs.personal_song_id column only exist
// once the personal-songs migration has been applied. Detect a PostgREST schema
// error about them so queries can fall back to the legacy (personal-free) shape
// and keep working against an un-migrated database.
function isMissingPersonalSchema(err) {
  const msg = String(err?.message || '')
  return (
    msg.includes('personal_song') ||
    msg.includes('verse_ref') ||
    err?.code === 'PGRST200' ||
    err?.code === 'PGRST204'
  )
}

const SETLIST_SELECT_PERSONAL =
  'id, name, service_date, updated_at, ' +
  'setlist_songs(id, song_id, personal_song_id, verse_ref, position, key_override, notes, ' +
  'songs(slug, title, artist, default_key, tempo, time_signature), ' +
  'personal_songs(slug, title, artist, default_key, tempo, time_signature))'

const SETLIST_SELECT_LEGACY =
  'id, name, service_date, updated_at, ' +
  'setlist_songs(id, song_id, position, key_override, notes, ' +
  'songs(slug, title, artist, default_key, tempo, time_signature))'

export async function fetchSetlist(client, setlistId) {
  // Embed each entry's song metadata so the builder/performer can render rows
  // immediately without waiting on the full song catalog to load. The chart
  // body (chordpro_content) is intentionally NOT embedded — it's fetched
  // per-song when a chart is actually shown. Falls back to the legacy select
  // when the personal-songs schema isn't present yet.
  let { data, error } = await client
    .from('setlists')
    .select(SETLIST_SELECT_PERSONAL)
    .eq('id', setlistId)
    .maybeSingle()
  if (error && isMissingPersonalSchema(error)) {
    ;({ data, error } = await client
      .from('setlists')
      .select(SETLIST_SELECT_LEGACY)
      .eq('id', setlistId)
      .maybeSingle())
  }
  if (error) throw error
  if (!data) return null
  // A personal-song entry exposes song_id as `personal:<uuid>` and a verse entry
  // exposes song_id as its `v:...` id, so the builder's single opaque-id model
  // round-trips; updateSetlist decodes both on save.
  const rows = /** @type {any[]} */ (data.setlist_songs || [])
  const entries = rows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => {
      const isVerse = !!row.verse_ref
      const isPersonal = !isVerse && !!row.personal_song_id
      let songId
      if (isVerse) songId = row.verse_ref
      else if (isPersonal) songId = `personal:${row.personal_song_id}`
      else songId = row.song_id
      return {
        id: row.id,
        song_id: songId,
        position: row.position,
        toKey: row.key_override || null,
        notes: row.notes || null,
        song: isVerse ? null : isPersonal ? row.personal_songs || null : row.songs || null,
      }
    })
  return {
    id: data.id,
    name: data.name,
    service_date: data.service_date,
    updated_at: data.updated_at,
    entries,
  }
}

/**
 * Create a new personal setlist (no songs yet) owned by the current user.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ name?: string, serviceDate?: string|null, id?: string }} [opts]
 *   Pass `id` to use a client-generated UUID (optimistic create): the caller
 *   can navigate to the setlist immediately while this insert is in flight.
 * @returns {Promise<{ id: string, name: string, service_date: string|null, created_at: string, updated_at: string }>}
 */
export async function createSetlist(client, opts = {}) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) throw authError || new Error('Not authenticated')

  const row = {
    owner_id: user.id,
    name: (opts.name || '').trim() || 'New Setlist',
    service_date: opts.serviceDate || null,
    team_id: null,
    edit_mode: 'suggest',
  }
  if (opts.id) row.id = opts.id

  const { data, error } = await client
    .from('setlists')
    .insert(row)
    .select('id, name, service_date, created_at, updated_at')
    .single()
  if (error) throw error
  return data
}

/**
 * Overwrite an existing setlist: update metadata, wipe entries, re-insert.
 * Position is the array index, so this one write path covers reorder,
 * remove, duplicate and key changes alike (web semantics).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} setlistId
 * @param {{ name?: string, serviceDate?: string|null, songs?: Array<{ id: string, toKey?: string|null }> }} input
 */
export async function updateSetlist(client, setlistId, input = {}) {
  const { error: updateError } = await client
    .from('setlists')
    .update({
      name: (input.name || '').trim() || 'Untitled Set',
      service_date: input.serviceDate || null,
    })
    .eq('id', setlistId)
  if (updateError) throw updateError

  const { error: deleteError } = await client
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlistId)
  if (deleteError) throw deleteError

  const songs = input.songs || []
  if (songs.length > 0) {
    // A `personal:<uuid>` id targets the personal_songs FK; anything else is a
    // public catalog song. Only personal rows carry personal_song_id, so a
    // catalog-only set writes the exact legacy row shape and keeps working
    // against a database that hasn't had the personal-songs migration applied.
    const rows = songs.map((song, i) => {
      // A `v:...` id is a bible verse; a `personal:<uuid>` id targets the
      // personal_songs FK; anything else is a public catalog song.
      const isVerse = isVerseId(song.id)
      const isPersonal = !isVerse && typeof song.id === 'string' && song.id.startsWith('personal:')
      const row = {
        setlist_id: setlistId,
        position: i,
        key_override: song.toKey || null,
        notes: null,
      }
      if (isVerse) row.verse_ref = song.id
      else if (isPersonal) row.personal_song_id = song.id.slice('personal:'.length)
      else row.song_id = song.id
      return row
    })
    const { error: songsError } = await client.from('setlist_songs').insert(rows)
    if (songsError) throw songsError
  }
}

/**
 * Delete a setlist by id. Cascade handles setlist_songs.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} setlistId
 */
export async function deleteSetlist(client, setlistId) {
  const { error } = await client.from('setlists').delete().eq('id', setlistId)
  if (error) throw error
}

/**
 * Fetch the most recently updated personal setlist with just enough entry
 * data to summarize it (Home's "Last set" card): per-entry key override plus
 * each song's default key. Returns null when the user has no setlists.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<{ id: string, name: string, updated_at: string, entries: Array<{ toKey: string|null, default_key: string|null, tempo: number|null }> }|null>}
 */
export async function fetchLastSetSummary(client) {
  const withPersonal =
    'id, name, updated_at, setlist_songs(key_override, ' +
    'songs(default_key, tempo), personal_songs(default_key, tempo))'
  const legacy = 'id, name, updated_at, setlist_songs(key_override, songs(default_key, tempo))'
  let { data, error } = await client
    .from('setlists')
    .select(withPersonal)
    .is('team_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && isMissingPersonalSchema(error)) {
    ;({ data, error } = await client
      .from('setlists')
      .select(legacy)
      .is('team_id', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle())
  }
  if (error) throw error
  if (!data) return null
  const entries = (data.setlist_songs || []).map((row) => {
    const s = row.songs || row.personal_songs
    return {
      toKey: row.key_override || null,
      default_key: (s && s.default_key) || null,
      tempo: (s && s.tempo) ?? null,
    }
  })
  return { id: data.id, name: data.name, updated_at: data.updated_at, entries }
}
