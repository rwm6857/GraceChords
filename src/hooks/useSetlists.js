// Setlist save/load operations using the setlists + setlist_songs tables.
// These are personal setlists only (team_id IS NULL).
import { supabase } from '../lib/supabase'

export const SETLIST_LIMITS = {
  owner: 30,
  admin: 20,
  editor: 10,
  collaborator: 5,
  user: 3,
}

export function getSetlistLimit(role) {
  return SETLIST_LIMITS[role] ?? SETLIST_LIMITS.user
}

/**
 * Fetch the current user's personal setlists, ordered by updated_at DESC.
 * Returns { data: [], error }
 */
export async function fetchPersonalSetlists() {
  return supabase
    .from('setlists')
    .select('id, name, service_date, created_at, updated_at, setlist_songs(count)')
    .is('team_id', null)
    .order('updated_at', { ascending: false })
}

/**
 * Save a new personal setlist.
 * songs: [{ dbId: uuid, toKey: string }]
 * Returns { data: setlist, error }
 */
export async function saveSetlist(name, serviceDate, songs) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { data: null, error: authError || new Error('Not authenticated') }

  const { data: setlist, error: insertError } = await supabase
    .from('setlists')
    .insert({
      owner_id: user.id,
      name: name?.trim() || 'Untitled Set',
      service_date: serviceDate || null,
      team_id: null,
      edit_mode: 'suggest',
    })
    .select('id, name, service_date, created_at, updated_at')
    .single()

  if (insertError) return { data: null, error: insertError }

  const songRows = (songs || [])
    .filter(s => s.dbId)
    .map((s, i) => ({
      setlist_id: setlist.id,
      song_id: s.dbId,
      position: i,
      key_override: s.toKey || null,
      notes: null,
    }))

  if (songRows.length) {
    const { error: songsError } = await supabase
      .from('setlist_songs')
      .insert(songRows)
    if (songsError) return { data: null, error: songsError }
  }

  return { data: setlist, error: null }
}

/**
 * Overwrite an existing personal setlist (update name/date, replace all songs).
 * Returns { data: setlist, error }
 */
export async function updateSetlist(setlistId, name, serviceDate, songs) {
  const { error: updateError } = await supabase
    .from('setlists')
    .update({
      name: name?.trim() || 'Untitled Set',
      service_date: serviceDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', setlistId)

  if (updateError) return { data: null, error: updateError }

  const { error: deleteError } = await supabase
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlistId)

  if (deleteError) return { data: null, error: deleteError }

  const songRows = (songs || [])
    .filter(s => s.dbId)
    .map((s, i) => ({
      setlist_id: setlistId,
      song_id: s.dbId,
      position: i,
      key_override: s.toKey || null,
      notes: null,
    }))

  if (songRows.length) {
    const { error: songsError } = await supabase
      .from('setlist_songs')
      .insert(songRows)
    if (songsError) return { data: null, error: songsError }
  }

  const { data: updated } = await supabase
    .from('setlists')
    .select('id, name, service_date, created_at, updated_at')
    .eq('id', setlistId)
    .single()

  return { data: updated, error: null }
}

/**
 * Delete a personal setlist (cascade removes setlist_songs).
 */
export async function deleteSetlist(setlistId) {
  return supabase
    .from('setlists')
    .delete()
    .eq('id', setlistId)
}

/**
 * Load a setlist's songs, ordered by position.
 * Returns { data: [{ id: slug, toKey: string }], error }
 */
export async function loadSetlist(setlistId) {
  const { data, error } = await supabase
    .from('setlist_songs')
    .select('position, key_override, songs(slug, default_key)')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: true })

  if (error) return { data: null, error }

  const entries = (data || [])
    .map(row => ({
      id: row.songs?.slug,
      toKey: row.key_override || row.songs?.default_key || 'C',
    }))
    .filter(e => e.id)

  return { data: entries, error: null }
}
