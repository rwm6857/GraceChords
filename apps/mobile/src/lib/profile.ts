// Sprite-avatar persistence. The pick is stored on public.users.preferences
// (JSONB) under the `sprite` key — the exact shape the web Profile page writes
// (apps/web/src/pages/ProfilePage.jsx saveProfile) — so the avatar follows the
// account across platforms with no schema change. The supabase client and the
// AsyncStorage-shaped store are injected so vitest can run this headless.
import type { SupabaseClient } from '@supabase/supabase-js'

export const PENDING_SPRITE_KEY = 'gc.pendingSprite'

export type KVStorage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export async function saveSpritePreference(
  client: SupabaseClient,
  userId: string,
  sprite: string,
): Promise<{ error: string | null }> {
  const { data: row, error: readError } = await client
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()
  if (readError) return { error: readError.message }

  // Merge — never clobber other preference keys the web app may have written.
  const preferences = { ...((row?.preferences as Record<string, unknown>) ?? {}), sprite }

  const { data: updated, error: writeError } = await client
    .from('users')
    .update({ preferences })
    .eq('id', userId)
    .select('id')
  if (writeError) return { error: writeError.message }
  if (!updated || updated.length === 0) {
    // RLS denied the write or the users row doesn't exist yet (trigger race).
    return { error: 'Profile row not found or not writable.' }
  }
  return { error: null }
}

export async function stashPendingSprite(storage: KVStorage, sprite: string): Promise<void> {
  await storage.setItem(PENDING_SPRITE_KEY, sprite)
}

// Flush a stashed pick once a session exists (called on SIGNED_IN). The key is
// removed only after a successful write so transient failures retry on the
// next sign-in; errors are swallowed — a preference must never break auth.
export async function flushPendingSprite(
  client: SupabaseClient,
  storage: KVStorage,
  userId: string,
): Promise<void> {
  try {
    const sprite = await storage.getItem(PENDING_SPRITE_KEY)
    if (!sprite) return
    const { error } = await saveSpritePreference(client, userId, sprite)
    if (!error) await storage.removeItem(PENDING_SPRITE_KEY)
  } catch {
    // Best-effort by design.
  }
}
