import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// EDIT ME: rotating sub-greetings shown under the hero greeting on Home.
// Add as many lines as you like — Home rotates through them by day. Keep them
// short (one line). This is the intended place to input your own phrases later.
// ─────────────────────────────────────────────────────────────────────────────
export const SUB_GREETINGS: string[] = [
  "Everything's where you left it.",
  "Let's get to it.",
  'Good to have you back.',
  "Glad you're here.",
  'One song at a time.',
  'Sing to Him a new song.',
  'Be still, and know.',
  'This is the day He has made.',
  'Let everything that has breath praise Him.',
  'He is your strength and your song.',
  'Whatever you do, for His glory.',
  'Enter His gates with thanksgiving.',
  'Bless the Lord, O my soul.',
  'His grace is enough.',
  'Rejoice always.',
]

/** Time-of-day greeting prefix, e.g. "Good morning". */
export function timeGreeting(date: Date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Pick a sub-greeting that stays stable for the whole day and rotates to the
 * next one tomorrow (deterministic, so it doesn't flicker on re-render).
 */
export function pickSubGreeting(date: Date = new Date()): string {
  if (SUB_GREETINGS.length === 0) return ''
  const dayNumber = Math.floor(date.getTime() / 86_400_000)
  return SUB_GREETINGS[dayNumber % SUB_GREETINGS.length]
}

/** A friendly first name for the greeting, derived from the auth user. */
export function getDisplayName(user: User | null): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const full = (meta.full_name ?? meta.name) as string | undefined
  if (full && full.trim()) return full.trim().split(/\s+/)[0]
  const email = user?.email
  if (email) return email.split('@')[0]
  return 'friend'
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
