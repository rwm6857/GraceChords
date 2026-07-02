// Platform-agnostic setlist queries (new setlists + setlist_songs schema).
//
// This is the canonical, client-injected counterpart to the web-side module at
// apps/web/src/hooks/useSetlists.js — same semantics (personal sets only,
// wipe-and-replace updates where position = array index), but callers inject
// the Supabase client created via createGcSupabase(), like songsRepo. Errors
// throw (songsRepo convention); callers catch. The per-entry setlist-scoped
// key lives in setlist_songs.key_override and is exposed app-side as `toKey`.

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
 * @returns {Promise<{ id: string, name: string, service_date: string|null, updated_at: string, entries: Array<{ id: string, song_id: string, position: number, toKey: string|null, notes: string|null }> }|null>}
 */
export async function fetchSetlist(client, setlistId) {
  const { data, error } = await client
    .from('setlists')
    .select('id, name, service_date, updated_at, setlist_songs(id, song_id, position, key_override, notes)')
    .eq('id', setlistId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const entries = (data.setlist_songs || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      id: row.id,
      song_id: row.song_id,
      position: row.position,
      toKey: row.key_override || null,
      notes: row.notes || null,
    }))
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
 * @param {{ name?: string, serviceDate?: string|null }} [opts]
 * @returns {Promise<{ id: string, name: string, service_date: string|null, created_at: string, updated_at: string }>}
 */
export async function createSetlist(client, opts = {}) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) throw authError || new Error('Not authenticated')

  const { data, error } = await client
    .from('setlists')
    .insert({
      owner_id: user.id,
      name: (opts.name || '').trim() || 'New Setlist',
      service_date: opts.serviceDate || null,
      team_id: null,
      edit_mode: 'suggest',
    })
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
    const rows = songs.map((song, i) => ({
      setlist_id: setlistId,
      song_id: song.id,
      position: i,
      key_override: song.toKey || null,
      notes: null,
    }))
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
  const { data, error } = await client
    .from('setlists')
    .select('id, name, updated_at, setlist_songs(key_override, songs(default_key, tempo))')
    .is('team_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const entries = (data.setlist_songs || []).map((row) => ({
    toKey: row.key_override || null,
    default_key: (row.songs && row.songs.default_key) || null,
    tempo: (row.songs && row.songs.tempo) ?? null,
  }))
  return { id: data.id, name: data.name, updated_at: data.updated_at, entries }
}
