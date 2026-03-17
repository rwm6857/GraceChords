// Supabase-backed setlists operations (new setlists + setlist_songs schema).
// All functions return { data, error } matching Supabase conventions.
import { supabase } from '../lib/supabase'

/**
 * Fetch all personal (team_id IS NULL) setlists for the current user,
 * sorted by updated_at DESC.  Includes a song count via relationship.
 */
export async function fetchPersonalSetlists() {
  return supabase
    .from('setlists')
    .select('id, name, service_date, created_at, updated_at, setlist_songs(count)')
    .is('team_id', null)
    .order('updated_at', { ascending: false })
}

/**
 * Save a brand-new setlist and its songs.
 * songs: array of { id: uuid, toKey: string }
 */
export async function saveSetlist(name, serviceDate, songs) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { data: null, error: authError || { message: 'Not authenticated' } }

  const { data: setlist, error: setlistError } = await supabase
    .from('setlists')
    .insert({
      owner_id: user.id,
      name: (name || '').trim() || 'Untitled Set',
      service_date: serviceDate || null,
      team_id: null,
      edit_mode: 'suggest',
    })
    .select('id, name, service_date, created_at, updated_at')
    .single()

  if (setlistError) return { data: null, error: setlistError }

  if (songs && songs.length > 0) {
    const rows = songs.map((song, i) => ({
      setlist_id: setlist.id,
      song_id: song.id,
      position: i,
      key_override: song.toKey || null,
      notes: null,
    }))
    const { error: songsError } = await supabase
      .from('setlist_songs')
      .insert(rows)
    if (songsError) return { data: setlist, error: songsError }
  }

  return { data: setlist, error: null }
}

/**
 * Overwrite an existing setlist: update metadata, wipe songs, re-insert.
 * songs: array of { id: uuid, toKey: string }
 */
export async function updateSetlist(setlistId, name, serviceDate, songs) {
  const { error: updateError } = await supabase
    .from('setlists')
    .update({
      name: (name || '').trim() || 'Untitled Set',
      service_date: serviceDate || null,
    })
    .eq('id', setlistId)

  if (updateError) return { error: updateError }

  const { error: deleteError } = await supabase
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlistId)

  if (deleteError) return { error: deleteError }

  if (songs && songs.length > 0) {
    const rows = songs.map((song, i) => ({
      setlist_id: setlistId,
      song_id: song.id,
      position: i,
      key_override: song.toKey || null,
      notes: null,
    }))
    const { error: songsError } = await supabase
      .from('setlist_songs')
      .insert(rows)
    if (songsError) return { error: songsError }
  }

  return { error: null }
}

/**
 * Delete a setlist by id.  Cascade handles setlist_songs.
 */
export async function deleteSetlist(setlistId) {
  return supabase
    .from('setlists')
    .delete()
    .eq('id', setlistId)
}

/**
 * Fetch the ordered songs for a setlist, ready to hydrate the working list.
 * Returns rows: [{ song_id, key_override, position }]
 */
export async function loadSetlist(setlistId) {
  return supabase
    .from('setlist_songs')
    .select('song_id, key_override, position')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: true })
}
