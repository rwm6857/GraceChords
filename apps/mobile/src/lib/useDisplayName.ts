import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { useCurrentUserState } from './currentUser'
import { fetchDisplayName, resolveDisplayName } from './profile'

// The current user's editable display name, resolved against the provider
// profile. Same shape as useProfileSprite: a module-level store so a save
// updates every consumer at once (the Account row, the Settings header card and
// Home's greeting all read it), plus a shared in-flight read so mounting three
// consumers costs one request.
//
// Reads public.users.display_name; falls back to user_metadata and then the
// email local part via resolveDisplayName. Returns null only when nothing is
// usable, so callers supply their own localized fallback.

let cachedUserId: string | null = null
let cachedName: string | null = null
const listeners = new Set<() => void>()

let fetchedUserId: string | null = null
let inFlight: Promise<void> | null = null

function emit() {
  for (const l of listeners) l()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function getSnapshot(): string | null {
  return cachedName
}

/** Update the cached name everywhere (call after a successful save). */
export function setLocalDisplayName(name: string | null): void {
  const next = name && name.trim() ? name.trim() : null
  if (cachedName === next) return
  cachedName = next
  emit()
}

export function useDisplayName(): string | null {
  const { user, resolved } = useCurrentUserState()
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    // Don't touch the cache before auth is known: a null user here means "not
    // resolved yet", not "signed out", and clearing on it would drop a good
    // name and then re-fetch it.
    if (!resolved) return
    const uid = user?.id ?? null
    if (uid !== cachedUserId) {
      cachedUserId = uid
      fetchedUserId = null
      inFlight = null
      setLocalDisplayName(null)
    }
    if (!uid) return
    if (fetchedUserId === uid) return
    if (!inFlight) {
      inFlight = fetchDisplayName(supabase, uid)
        .then((name) => {
          // Ignore a late result for an account we have since switched away from.
          if (cachedUserId !== uid) return
          fetchedUserId = uid
          if (name) setLocalDisplayName(name)
        })
        .catch(() => {
          // A failed read is indistinguishable from "never set" — the caller
          // falls back to the provider profile, which is the same value the
          // column was seeded with. Not marked fetched, so the next mount
          // retries.
        })
        .finally(() => {
          inFlight = null
        })
    }
  }, [user?.id, resolved])

  return resolveDisplayName(stored, user)
}
