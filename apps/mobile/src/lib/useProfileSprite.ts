import { useEffect, useSyncExternalStore } from 'react'
import type { ImageSourcePropType } from 'react-native'
import { supabase } from './supabase'
import { useCurrentUser } from './greetings'
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
  const user = useCurrentUser()
  const spriteId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    const uid = user?.id ?? null
    // Reset the cache when the account changes (sign out / switch user).
    if (uid !== cachedUserId) {
      cachedUserId = uid
      setLocalSprite(null)
    }
    if (!uid) return
    let alive = true
    fetchSpritePreference(supabase, uid)
      .then((id) => {
        if (alive && id && id in SPRITE_SOURCES) setLocalSprite(id as SpriteId)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user?.id])

  return { spriteId, source: spriteId ? SPRITE_SOURCES[spriteId] : null }
}
