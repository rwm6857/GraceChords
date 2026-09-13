import { useEffect, useSyncExternalStore } from 'react'
import type { ImageSourcePropType } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { useCurrentUserState } from './currentUser'
import {
  clearCachedSprite,
  fetchSpritePreference,
  readCachedSprite,
  writeCachedSprite,
} from './profile'
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
//
// The network read is now REVALIDATION, not the only source: the last known
// sprite is persisted (profile.ts) and hydrated first, so the avatar is correct
// on the first frame and stays correct offline. The remote read still wins when
// it lands, so a change made on the web still propagates.
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
    if (!uid) {
      // Signed out: the next account must not inherit this avatar.
      void clearCachedSprite(AsyncStorage)
      return
    }
    if (fetchedUserId === uid) return
    if (!inFlight) {
      // Paint from disk first. Deliberately does NOT set `fetchedUserId`: the
      // cache is a head start, not a substitute for the read below.
      void readCachedSprite(AsyncStorage, uid).then((id) => {
        if (cachedUserId !== uid) return
        // A remote read that already landed wins — this is the slower path only
        // when the network is fast, and it must not overwrite a fresher value.
        if (fetchedUserId === uid) return
        if (id && id in SPRITE_SOURCES) setLocalSprite(id as SpriteId)
      })
      inFlight = fetchSpritePreference(supabase, uid)
        .then((id) => {
          // Ignore a late result for an account we have since switched away from.
          if (cachedUserId !== uid) return
          fetchedUserId = uid
          const next = id && id in SPRITE_SOURCES ? (id as SpriteId) : null
          setLocalSprite(next)
          void writeCachedSprite(AsyncStorage, uid, next)
        })
        .catch(() => {
          // A failed read is NOT "no sprite picked" — offline it is the normal
          // outcome — so the cached value stays on screen rather than being
          // cleared. Un-surfaced on purpose: a cosmetic preference, not content.
          // Not marked as fetched, so the next mount retries.
        })
        .finally(() => {
          inFlight = null
        })
    }
  }, [user?.id, resolved])

  return { spriteId, source: spriteId ? SPRITE_SOURCES[spriteId] : null }
}
