import { useEffect, useState } from 'react'
import { fetchUserRole } from '@gracechords/core'
import { supabase } from './supabase'

// The current user's role, read once via the canonical core helper. Used to
// decide editor-direct-write vs submit-for-review in the song editor. Defaults
// to 'user' (and stays there for signed-out users).
export function useUserRole() {
  const [role, setRole] = useState<string>('user')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    fetchUserRole(supabase)
      .then((r: string) => {
        if (alive) setRole(r)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return { role, ready }
}
