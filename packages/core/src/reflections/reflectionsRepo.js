// Platform-agnostic reflection queries (private per-user reading reflections).
//
// Client-injected counterpart to the mobile hook at
// apps/mobile/src/lib/useReflections.ts — callers inject the Supabase client
// created via createGcSupabase() (like setlistsRepo/songsRepo). Errors throw;
// callers catch. Phase 1 is PRIVATE-ONLY: createReflection always writes
// visibility = 'private' and the queries only ever touch the caller's own rows
// (RLS scopes SELECT/INSERT/DELETE to auth.uid(); there is no UPDATE path — the
// no-edit rule is enforced at the DB layer).

const REFLECTION_COLUMNS =
  'id, user_id, reflection_date, content_key, visibility, body, created_at'

/**
 * Fetch the current user's private reflections, newest day first.
 * RLS restricts the result to the caller's own rows.
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
