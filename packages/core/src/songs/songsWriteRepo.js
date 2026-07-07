// Editor+ direct writes to the public `songs` table, factored out of the web
// EditorPage so web and mobile share one path. RLS (has_min_role('editor'))
// still gates these — a non-editor call is rejected by the DB. Errors throw.

import { formToSongRow } from './songAuthoring'
import { deriveUniqueSlug } from './slug'

/**
 * Upsert a song from editor form values (editor+ direct-save). Derives a unique
 * slug, stamps timestamps, and returns the saved row.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {import('./songAuthoring').SongForm} form
 * @param {{ id?: string, slug?: string }} [existing]  The song being edited, if any.
 */
export async function upsertSong(client, form, existing = {}) {
  const slug = existing.slug || (await deriveUniqueSlug(client, form.title, { currentId: existing.id }))
  const now = new Date().toISOString()
  const payload = {
    ...formToSongRow(form),
    slug,
    is_deleted: false,
    updated_at: now,
  }
  if (!existing.id) payload.created_at = now

  const { data, error } = await client
    .from('songs')
    .upsert(payload, { onConflict: 'slug' })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Soft-delete a song (admin+ per RLS).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 */
export async function softDeleteSong(client, id) {
  const { error } = await client
    .from('songs')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Write an editor_audit_log row. Best-effort — callers may ignore failures.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ actorId?: string, action: string, songId?: string, songSlug?: string, songTitle?: string, payload?: any, note?: string }} entry
 */
export async function writeAuditLog(client, entry = {}) {
  const { error } = await client.from('editor_audit_log').insert({
    actor_id: entry.actorId || null,
    action: entry.action,
    song_id: entry.songId || null,
    song_slug: entry.songSlug || null,
    song_title: entry.songTitle || null,
    payload_snapshot: entry.payload || null,
    note: entry.note || null,
  })
  if (error) throw error
}
