import { useEffect, useSyncExternalStore } from 'react'
import type { ImageSourcePropType } from 'react-native'
import { supabase } from './supabase'
import { useCurrentUserState } from './currentUser'
import { fetchSpritePreference } from './profile'
import { SPRITE_SOURCES, type SpriteId } from './sprites'

// The current user's chosen sprite, resolved to a static image source. Backed by
// a tiny in-memory store so a save (setLocalSprite) updates every consumer at
// once — e.g. the Settings profile card and the Home header avatar refresh
// immediately after the avatar is changed, with no remount. Returns null until
// it loads / when the user hasn't picked one, so callers fall back to `person`.

let cachedUserId: string | null = null
let cachedSprite: SpriteId | null = null
const listeners = new Set<() => void>()

// The read is shared across consumers, not just the result. Four screens use this
// hook (Home, Settings, the Daily Word landing, the sprite picker) and each used
// to issue its own `users.preferences` select on mount, because the effect fires
// per hook instance and cachedSprite is only populated once a fetch resolves.
// `fetchedUserId` records who we have already read for; `inFlight` coalesces
// concurrent mounts into one request.
let fetchedUserId: string | null = null
let inFlight: Promise<void> | null = null

function emit() {
  for (const l of listeners) l()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function getSnapshot(): SpriteId | null {
  return cachedSprite
}

/** Update the cached sprite everywhere (call after a successful save). */
export function setLocalSprite(id: SpriteId | null): void {
  if (cachedSprite === id) return
  cachedSprite = id
  emit()
}

export function useProfileSprite(): { spriteId: SpriteId | null; source: ImageSourcePropType | null } {
  const { user, resolved } = useCurrentUserState()
  const spriteId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    // Don't touch the cache before auth is known: a null user here would mean
    // "not resolved yet", not "signed out", and clearing on it would drop a
    // perfectly good sprite (and then re-fetch it).
    if (!resolved) return
    const uid = user?.id ?? null
    // Reset the cache when the account changes (sign out / switch user).
    if (uid !== cachedUserId) {
      cachedUserId = uid
      fetchedUserId = null
      inFlight = null
      setLocalSprite(null)
    }
    if (!uid) return
    if (fetchedUserId === uid) return
    if (!inFlight) {
      inFlight = fetchSpritePreference(supabase, uid)
        .then((id) => {
          // Ignore a late result for an account we have since switched away from.
          if (cachedUserId !== uid) return
          fetchedUserId = uid
          if (id && id in SPRITE_SOURCES) setLocalSprite(id as SpriteId)
        })
        .catch(() => {
          // A failed read is indistinguishable from "no sprite picked" — the
          // caller falls back to the `person` glyph. Left un-surfaced on purpose:
          // it is a cosmetic preference, not content. Not marked as fetched, so
          // the next mount retries.
        })
        .finally(() => {
          inFlight = null
        })
    }
  }, [user?.id, resolved])

  return { spriteId, source: spriteId ? SPRITE_SOURCES[spriteId] : null }
}
