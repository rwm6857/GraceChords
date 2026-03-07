// Supabase-backed saved sets operations.
// Falls back gracefully; error handling is the caller's responsibility.
import { supabase } from '../../lib/supabase'

/**
 * Fetch all saved sets for the current user, ordered by updated_at desc.
 * Returns { data: [], error }
 */
export async function fetchSavedSets() {
  return supabase
    .from('saved_sets')
    .select('id, name, items, created_at, updated_at')
    .order('updated_at', { ascending: false })
}

/**
 * Upsert a set. If id is provided, update it; otherwise insert.
 * items should be an array of { id, toKey } (no uid — uid is client-only).
 * Returns { data, error }
 */
export async function upsertSavedSet({ id, name, items }) {
  const payload = {
    name: name?.trim() || 'Untitled Set',
    items: (items || []).map(({ id: songId, toKey }) => ({ id: songId, toKey: toKey || '' })),
    updated_at: new Date().toISOString(),
  }
  if (id) {
    return supabase
      .from('saved_sets')
      .update(payload)
      .eq('id', id)
      .select('id, name, items, created_at, updated_at')
      .single()
  }
  return supabase
    .from('saved_sets')
    .insert(payload)
    .select('id, name, items, created_at, updated_at')
    .single()
}

/**
 * Delete a saved set by id.
 * Returns { error }
 */
export async function deleteSavedSet(id) {
  return supabase
    .from('saved_sets')
    .delete()
    .eq('id', id)
}
