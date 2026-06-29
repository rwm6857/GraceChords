// Platform-agnostic song queries.
//
// The web app currently issues its songs query inline in
// apps/web/src/hooks/useSongs.jsx (with a web-specific stale-while-revalidate
// cache and a heavier row→view normalisation). Core deliberately did not export
// a song query layer; the mobile slice needs one, so this is an ADDITIVE export
// — it does not change any web behaviour. Callers inject the Supabase client
// created via createGcSupabase(), keeping core free of env/storage concerns.

/**
 * Fetch the catalog of non-deleted songs, ordered by title.
 * Returns the raw Supabase rows (a thin, shared shape). Platform-specific
 * normalisation (e.g. slug→id, artist→authors) stays in the consuming app.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ columns?: string }} [opts] - override the selected columns.
 * @returns {Promise<Array<{ id: string, slug: string, title: string, artist: string|null, default_key: string|null }>>}
 */
export async function fetchSongList(client, opts = {}) {
  const columns = opts.columns || 'id, slug, title, artist, default_key'
  const { data, error } = await client
    .from('songs')
    .select(columns)
    .eq('is_deleted', false)
    .order('title')
  if (error) throw error
  return data || []
}
