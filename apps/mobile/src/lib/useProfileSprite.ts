import { useEffect, useState } from 'react'
import type { ImageSourcePropType } from 'react-native'
import { supabase } from './supabase'
import { useCurrentUser } from './greetings'
import { fetchSpritePreference } from './profile'
import { SPRITE_SOURCES, type SpriteId } from './sprites'

// Reads the current user's chosen sprite (public.users.preferences.sprite) and
// resolves it to a static image source. Returns null until it loads / when the
// user hasn't picked one, so callers fall back to the default `person` symbol.

export function useProfileSprite(): { spriteId: SpriteId | null; source: ImageSourcePropType | null } {
  const user = useCurrentUser()
  const [spriteId, setSpriteId] = useState<SpriteId | null>(null)

  useEffect(() => {
    if (!user?.id) {
      setSpriteId(null)
      return
    }
    let alive = true
    fetchSpritePreference(supabase, user.id)
      .then((id) => {
        if (alive && id && id in SPRITE_SOURCES) setSpriteId(id as SpriteId)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user?.id])

  return { spriteId, source: spriteId ? SPRITE_SOURCES[spriteId] : null }
}
