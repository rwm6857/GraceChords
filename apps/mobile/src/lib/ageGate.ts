import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Age assurance for Shared Reflections. Users under 13 are kept out of the public
// feed (Apple "Social Media" + "Disabled for Under 13"). The coarse age RANGE is
// recorded server-side (users.age_range) via the record_age_range() SECURITY
// DEFINER RPC and read back from the caller's own row, so it persists across
// launches/devices. No birthdate is stored. Mirrors ugc.ts.

export type AgeRange = 'under_13' | '13_plus'
/** How the range was determined: user self-declaration, or Apple's Declared Age Range API. */
export type AgeSource = 'self' | 'declared_api'

/** The caller's stored age range, or null if they've never been asked. Never throws. */
export async function fetchAgeRange(client: SupabaseClient, uid: string): Promise<AgeRange | null> {
  const { data, error } = await client
    .from('users')
    .select('age_range')
    .eq('id', uid)
    .maybeSingle()
  if (error || !data) return null
  const value = (data as { age_range?: string | null }).age_range
  return value === 'under_13' || value === '13_plus' ? value : null
}

/** Record the current user's age range (idempotent; overwrites on re-attestation). */
export async function recordAgeRange(
  client: SupabaseClient,
  range: AgeRange,
  source: AgeSource = 'self',
): Promise<void> {
  const { error } = await client.rpc('record_age_range', { p_range: range, p_source: source })
  if (error) throw error
}

/**
 * Reactive age-gate state for the current session. `ready` gates rendering (so the
 * public section never flashes before we know the age), `range` is null until the
 * user is asked, `isThirteenPlus` drives whether the public feed/compose may show,
 * and `record()` writes + updates local state so the gate resolves without a
 * refetch.
 */
export function useAgeGate() {
  const [range, setRange] = useState<AgeRange | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (!uid) {
      setRange(null)
      setReady(true)
      return
    }
    const stored = await fetchAgeRange(supabase, uid)
    setRange(stored)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const record = useCallback(async (next: AgeRange, source: AgeSource = 'self') => {
    await recordAgeRange(supabase, next, source)
    setRange(next)
  }, [])

  return { range, isThirteenPlus: range === '13_plus', ready, refresh, record }
}
