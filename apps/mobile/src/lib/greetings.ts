import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// The greeting PHRASES live in the home locale namespace
// (src/i18n/locales/<lng>/home.json — greeting.* and the editable subGreetings
// array). This module stays RN/i18n-free (unit-testable) and returns keys or
// indices; Home resolves them through its own `t`.

/** Time-of-day greeting key under home:greeting.*, e.g. 'greeting.morning'. */
export function timeGreetingKey(date: Date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'greeting.morning'
  if (h < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

/**
 * The sub-greeting index for this app launch. Chosen once at module load so it
 * stays stable across re-renders and navigation within a session, and varies
 * between launches. Picking here (not on each render) avoids flicker. Home maps
 * it into the home:subGreetings array (modulo its length, so locale files may
 * carry any number of phrases).
 */
const LAUNCH_SUB_GREETING_INDEX = Math.floor(Math.random() * 1024)

export function pickSubGreetingIndex(): number {
  return LAUNCH_SUB_GREETING_INDEX
}

/**
 * A friendly first name for the greeting, derived from the auth user.
 * Returns null when nothing usable exists — callers show the localized
 * home:greeting.friend fallback.
 */
export function getDisplayName(user: User | null): string | null {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const full = (meta.full_name ?? meta.name) as string | undefined
  if (full && full.trim()) return full.trim().split(/\s+/)[0]
  const email = user?.email
  if (email) return email.split('@')[0]
  return null
}

/** Track the current auth user (for the greeting). Mirrors the root auth wiring. */
export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  return user
}
