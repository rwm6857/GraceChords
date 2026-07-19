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
  'id, user_id, reflection_date, content_key, visibility, body, created_at, heart_count'

// Public feed columns — NO user_id or any author-identifying field. The public
// feed is anonymous; the row's owner must never reach the client payload.
const PUBLIC_FEED_COLUMNS = 'id, body, heart_count'

/**
 * Fetch ALL of the current user's own reflections (private + public), newest day
 * first, for the journal. RLS (own_select) restricts the result to the caller.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<import('./types').Reflection[]>}
 */
export async function fetchReflections(client) {
  const { data, error } = await client
    .from('reflections')
    .select(REFLECTION_COLUMNS)
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

// ── Public reflections (Phase 2B) ────────────────────────────────────────────
// Public rows are WRITTEN only by the service-role submit endpoint after
// moderation (there is no client public-insert policy). These functions cover
// the client READ + hearts paths, all gated by RLS (today-only, flag-on, not
// removed, not banned).

/**
 * Today's anonymous public feed. Selects ONLY id/body/heart_count — never
 * user_id — so no author identity reaches the client. The public_feed_read RLS
 * policy already restricts to today / public / not-removed / not-banned /
 * feature-on, so no client-side date or removal filtering is needed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<import('./types').PublicReflection[]>}
 */
export async function fetchPublicFeed(client) {
  const { data, error } = await client
    .from('reflections')
    .select(PUBLIC_FEED_COLUMNS)
    .eq('visibility', 'public')
    .order('heart_count', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * The caller's OWN public post for a day (or null). Scoped to the caller's uid
 * so it returns only their row; used to identify their post in the feed (to
 * disable self-heart) and to show it in the "Share a reflection" slot.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} uid
 * @param {string} dateKey  YYYY-MM-DD
 * @returns {Promise<import('./types').PublicReflection|null>}
 */
export async function fetchMyPublicPost(client, uid, dateKey) {
  const { data, error } = await client
    .from('reflections')
    .select(PUBLIC_FEED_COLUMNS)
    .eq('visibility', 'public')
    .eq('user_id', uid)
    .eq('reflection_date', dateKey)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * Which of the given reflection ids the caller has hearted. hearts_select_own
 * returns only the caller's own heart rows, so other hearters are never exposed.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string[]} reflectionIds
 * @returns {Promise<string[]>}
 */
export async function fetchMyHeartedIds(client, reflectionIds) {
  if (!reflectionIds || reflectionIds.length === 0) return []
  const { data, error } = await client
    .from('reflection_hearts')
    .select('reflection_id')
    .in('reflection_id', reflectionIds)
  if (error) throw error
  return (data || []).map((r) => r.reflection_id)
}

/**
 * Heart a post (idempotent). RLS (hearts_insert_own) blocks self-hearts and
 * non-visible posts; the heart_count trigger keeps the denormalized count.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} uid
 * @param {string} reflectionId
 */
export async function heartReflection(client, uid, reflectionId) {
  const { error } = await client
    .from('reflection_hearts')
    .upsert({ reflection_id: reflectionId, user_id: uid }, { onConflict: 'reflection_id,user_id' })
  if (error) throw error
}

/**
 * Remove the caller's heart from a post.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} uid
 * @param {string} reflectionId
 */
export async function unheartReflection(client, uid, reflectionId) {
  const { error } = await client
    .from('reflection_hearts')
    .delete()
    .eq('reflection_id', reflectionId)
    .eq('user_id', uid)
  if (error) throw error
}

/**
 * Read the public_reflections kill switch. flags_select_all makes this readable
 * by any client; the DB still enforces the flag independently on every write/
 * read path, so this only drives whether the UI renders the feature.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<boolean>}
 */
export async function fetchPublicReflectionsEnabled(client) {
  const { data, error } = await client
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'public_reflections')
    .maybeSingle()
  if (error) throw error
  return !!data?.enabled
}
