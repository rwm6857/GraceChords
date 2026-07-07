// Submit + review song suggestions. Shared by web and mobile. Submission is
// open to any authenticated user (RLS); review goes through the
// review_song_suggestion RPC (SECURITY DEFINER, editor-gated). Errors throw.

/**
 * Insert a pending song suggestion.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{
 *   type: 'addition'|'edit'|'deletion',
 *   payload: Record<string, any>,
 *   songId?: string|null,           // published target for edit/deletion; null for addition
 *   personalSongId?: string|null,   // the draft this came from (addition/edit)
 * }} input
 */
export async function submitSongSuggestion(client, input) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) throw authError || new Error('Not authenticated')

  const { data, error } = await client
    .from('song_suggestions')
    .insert({
      song_id: input.songId || null,
      personal_song_id: input.personalSongId || null,
      suggested_by: user.id,
      type: input.type,
      payload: input.payload || {},
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) throw error
  return data
}

/**
 * Fetch pending suggestions for a published song (reviewer view). RLS restricts
 * this to the suggester or editor+.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} songId
 */
export async function fetchSuggestionsForSong(client, songId) {
  const { data, error } = await client
    .from('song_suggestions')
    .select('*, users!suggested_by(display_name)')
    .eq('song_id', songId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Approve or reject a suggestion via the atomic, editor-gated RPC. On approve
 * this publishes into `songs` (or soft-deletes for a deletion) and flips the
 * linked draft to published; on reject it records the reason and reopens the
 * draft. Returns the RPC's jsonb result.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} suggestionId
 * @param {'approve'|'reject'} action
 * @param {string|null} [reason]
 */
export async function reviewSongSuggestion(client, suggestionId, action, reason = null) {
  const { data, error } = await client.rpc('review_song_suggestion', {
    p_suggestion_id: suggestionId,
    p_action: action,
    p_reason: reason,
  })
  if (error) throw error
  return data
}
