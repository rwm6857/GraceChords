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

// Read the saved sprite id back from public.users.preferences.sprite. Returns
// null when unset, on error, or if RLS/absent row denies the read — callers
// fall back to a default avatar.
export async function fetchSpritePreference(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  const sprite = (data.preferences as Record<string, unknown> | null)?.sprite
  return typeof sprite === 'string' ? sprite : null
}

// ---------------------------------------------------------------------------
// Display name
//
// The editable name is stored on public.users.display_name, NOT in
// auth.users.user_metadata. Two reasons, both load-bearing:
//
//   1. OAuth providers repopulate user_metadata on sign-in, so a name edited
//      there is silently overwritten by the next Google or Apple sign-in.
//   2. display_name already exists, is already what the web Profile page writes,
//      and is one of only two columns `authenticated` may UPDATE
//      (20260806000500_users_grant_hardening.sql). No schema change is needed.
//
// handle_new_user() seeds it from raw_user_meta_data->>'full_name' at signup and
// never runs again, so a user who has never edited their name still has the
// provider-supplied value in this column rather than a blank.
// ---------------------------------------------------------------------------

/** Read public.users.display_name. Null when unset or the read is denied. */
export async function fetchDisplayName(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  const name = (data as { display_name?: unknown }).display_name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

export async function saveDisplayName(
  client: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<{ error: string | null }> {
  const { data: updated, error } = await client
    .from('users')
    .update({ display_name: displayName.trim() })
    .eq('id', userId)
    .select('id')
  if (error) return { error: error.message }
  if (!updated || updated.length === 0) {
    // RLS denied the write or the users row doesn't exist yet (trigger race).
    return { error: 'Profile row not found or not writable.' }
  }
  return { error: null }
}

type NameMetadataSource = {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
} | null

/**
 * The name to show, in precedence order: the edited column, then the provider
 * profile, then the email local part. Returns null when nothing is usable —
 * callers supply their own localized fallback.
 *
 * Pure, so the precedence is unit-tested rather than inferred from a screen.
 */
export function resolveDisplayName(stored: string | null, user: NameMetadataSource): string | null {
  if (stored && stored.trim()) return stored.trim()
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const full = (meta.full_name ?? meta.name) as string | undefined
  if (full && full.trim()) return full.trim()
  const email = user?.email
  if (email) return email.split('@')[0]
  return null
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
