// Owner-scoped CRUD for personal (unpublished) songs. Client-injected like
// songsRepo / setlistsRepo; RLS scopes every query to the current user, so no
// explicit owner filter is needed on reads. Errors throw (repo convention).

const LIST_COLUMNS =
  'id, slug, title, artist, default_key, tags, tempo, time_signature, ' +
  'status, source_song_id, published_song_id, created_at, updated_at'

const FULL_COLUMNS =
  LIST_COLUMNS + ', country, youtube_id, language, pptx_url, mp3_url, chordpro_content'

/**
 * Fetch the current user's personal songs, newest first.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
export async function fetchPersonalSongs(client) {
  const { data, error } = await client
    .from('personal_songs')
    .select(LIST_COLUMNS)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Fetch one personal song by id (includes the chart body).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 */
export async function fetchPersonalSongById(client, id) {
  const { data, error } = await client
    .from('personal_songs')
    .select(FULL_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Create a personal song owned by the current user.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {Record<string, any>} input  Row fields (title required). Pass `id` to
 *   use a client-generated UUID for optimistic navigation.
 */
export async function createPersonalSong(client, input = {}) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) throw authError || new Error('Not authenticated')

  const row = { ...input, owner_id: user.id }
  const { data, error } = await client
    .from('personal_songs')
    .insert(row)
    .select(FULL_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * Patch a personal song. RLS ensures only the owner can update it.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 * @param {Record<string, any>} patch
 */
export async function updatePersonalSong(client, id, patch = {}) {
  const { data, error } = await client
    .from('personal_songs')
    .update(patch)
    .eq('id', id)
    .select(FULL_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * Delete a personal song by id.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 */
export async function deletePersonalSong(client, id) {
  const { error } = await client.from('personal_songs').delete().eq('id', id)
  if (error) throw error
}
