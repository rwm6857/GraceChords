// Supabase-backed setlists operations (new setlists + setlist_songs schema).
// All functions return { data, error } matching Supabase conventions.
import { supabase } from '../lib/supabase'
import { isVerseId } from '@gracechords/core'

// Map a working-list item id to the right setlist_songs column. An item id is a
// `v:...` bible verse, a `personal:<uuid>` draft, or a public catalog song uuid.
function setlistSongRow(song, i, setlistId) {
  const row = { setlist_id: setlistId, position: i, key_override: song.toKey || null, notes: null }
  if (isVerseId(song.id)) row.verse_ref = song.id
  else if (typeof song.id === 'string' && song.id.startsWith('personal:')) {
    row.personal_song_id = song.id.slice('personal:'.length)
  } else row.song_id = song.id
  return row
}

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
    const rows = songs.map((song, i) => setlistSongRow(song, i, setlist.id))
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
    const rows = songs.map((song, i) => setlistSongRow(song, i, setlistId))
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
 * Returns rows: [{ song_id, key_override, position }] where `song_id` is the
 * working-list opaque id — a public uuid, `personal:<uuid>`, or a `v:...` verse.
 */
export async function loadSetlist(setlistId) {
  const { data, error } = await supabase
    .from('setlist_songs')
    .select('song_id, personal_song_id, verse_ref, key_override, position')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: true })
  if (error) return { data: null, error }
  const rows = (data || []).map((r) => ({
    song_id: r.verse_ref
      ? r.verse_ref
      : r.personal_song_id
        ? `personal:${r.personal_song_id}`
        : r.song_id,
    key_override: r.key_override,
    position: r.position,
  }))
  return { data: rows, error: null }
}
