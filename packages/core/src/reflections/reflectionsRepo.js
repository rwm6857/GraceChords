// Platform-agnostic reflection queries (private per-user reading reflections).
//
// Client-injected counterpart to the mobile hook at
// apps/mobile/src/lib/useReflections.ts — callers inject the Supabase client
// created via createGcSupabase() (like setlistsRepo/songsRepo). Errors throw;
// callers catch.
//
// Reflections are PRIVATE-ONLY. createReflection hard-codes visibility =
// 'private', updateReflection is scoped to the owner's own private rows, and
// every read filters visibility = 'private' explicitly rather than relying on
// RLS alone — see the note on fetchReflections.

const REFLECTION_COLUMNS =
  'id, user_id, reflection_date, content_key, visibility, body, created_at'

/**
 * Fetch the current user's own reflections, newest day first, for the journal.
 *
 * The `.eq('visibility', 'private')` filter is load-bearing and must stay. RLS
 * SELECT policies are PERMISSIVE and therefore OR'd together: while a
 * public-feed read policy exists on this table, an unfiltered select returns
 * the caller's own rows PLUS every other user's public rows, which would put
 * strangers' text in the user's private journal. Filtering here means the
 * journal is correct regardless of which policies are installed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<import('./types').Reflection[]>}
 */
export async function fetchReflections(client) {
  const { data, error } = await client
    .from('reflections')
    .select(REFLECTION_COLUMNS)
    .eq('visibility', 'private')
    .order('reflection_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Fetch the current user's private reflection for a single day, or null.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} dateKey  Local day as YYYY-MM-DD.
 * @returns {Promise<import('./types').Reflection|null>}
 */
export async function fetchReflectionForDate(client, dateKey) {
  const { data, error } = await client
    .from('reflections')
    .select(REFLECTION_COLUMNS)
    .eq('visibility', 'private')
    .eq('reflection_date', dateKey)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Create a private reflection for the given day. A second reflection for the
 * same day violates the (user_id, reflection_date, visibility) unique index and
 * rejects with Postgres code 23505 — callers surface that as a graceful
 * "already written today" message rather than a crash.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ reflectionDate: string, body: string, contentKey?: string|null }} input
 * @returns {Promise<import('./types').Reflection>}
 */
export async function createReflection(client, input = {}) {
  const { data: userData, error: authError } = await client.auth.getUser()
  const user = userData && userData.user
  if (authError || !user) throw authError || new Error('Not authenticated')

  const row = {
    user_id: user.id,
    reflection_date: input.reflectionDate,
    body: (input.body || '').trim(),
    content_key: input.contentKey || null,
    visibility: 'private',
  }

  const { data, error } = await client
    .from('reflections')
    .insert(row)
    .select(REFLECTION_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * Update the body of one of the caller's own PRIVATE reflections. RLS
 * (own_update_private) restricts this to the owner's private rows and forbids
 * flipping visibility to public, so public posts stay immutable. The
 * `.eq('visibility', 'private')` filter mirrors that at the query layer.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 * @param {string} body
 * @returns {Promise<import('./types').Reflection>}
 */
export async function updateReflection(client, id, body) {
  const { data, error } = await client
    .from('reflections')
    .update({ body: (body || '').trim() })
    .eq('id', id)
    .eq('visibility', 'private')
    .select(REFLECTION_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/**
 * Delete one of the current user's reflections by id (RLS-scoped to the owner).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteReflection(client, id) {
  const { error } = await client.from('reflections').delete().eq('id', id)
  if (error) throw error
}

/** True when an error is the one-reflection-per-day unique-index violation. */
export function isDuplicateReflectionError(err) {
  return err?.code === '23505' || String(err?.message || '').includes('reflections_one_per_day')
}
