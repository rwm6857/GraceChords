// Single canonical read of the current user's role from public.users. Both apps
// should use this instead of inlining `from('users').select('role')`, so the
// column name (`role`) lives in exactly one place. Errors throw.

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<string>} the user's role, or 'user' if unauthenticated/missing.
 */
export async function fetchUserRole(client) {
  const { data: userData } = await client.auth.getUser()
  const user = userData && userData.user
  if (!user) return 'user'
  const { data, error } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return (data && data.role) || 'user'
}
