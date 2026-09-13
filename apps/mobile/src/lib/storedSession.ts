import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'

// Reads the session supabase-js persisted, without the network.
//
// This exists for one case: a launch where getSession() cannot confirm the
// session because the device is offline. See readStoredSessionSafely in
// authSession.ts for why an unconfirmable session is not a signed-out one.
//
// It reads auth-js's own storage entry rather than adding a second copy of the
// session on disk. Two copies would need keeping in sync on every refresh, sign
// out and token rotation, and the failure mode of a stale duplicate is exactly
// the bug this is meant to fix, wearing a different hat.

/**
 * auth-js's default storage key, recomputed rather than configured.
 *
 * It derives the key as `sb-<project ref>-auth-token`, where the project ref is
 * the first label of the Supabase URL's hostname. Passing an explicit
 * `storageKey` to createClient would be tidier, but any value other than this
 * one points at an empty slot — which would sign out every user on the device
 * the moment they updated. So it is mirrored, not set.
 */
export function authStorageKey(supabaseUrl: string): string {
  const host = String(supabaseUrl || '')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  const ref = host.split('.')[0]
  return `sb-${ref}-auth-token`
}

/** Parse auth-js's stored blob into a Session, or null if it isn't one. */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    // auth-js has stored both the bare session and a { currentSession } wrapper
    // across versions; accept either rather than pinning to today's shape.
    const session = parsed?.currentSession ?? parsed
    if (!session || typeof session !== 'object') return null
    if (!session.access_token || !session.refresh_token) return null
    return session as Session
  } catch {
    return null
  }
}

export function makeStoredSessionReader(supabaseUrl: string) {
  const key = authStorageKey(supabaseUrl)
  return async (): Promise<Session | null> => {
    try {
      return parseStoredSession(await AsyncStorage.getItem(key))
    } catch {
      return null
    }
  }
}
