import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// UGC (Shared Reflections) terms acceptance. A user must accept the Apple 1.2
// EULA once before their first PUBLIC post. Acceptance is recorded server-side
// (users.ugc_accepted_at) via the accept_ugc_terms() SECURITY DEFINER RPC and
// read back from the caller's own row — so it persists across launches/devices.

/** Has the given user accepted the Shared Reflections terms? Never throws. */
export async function fetchUgcAccepted(client: SupabaseClient, uid: string): Promise<boolean> {
  const { data, error } = await client
    .from('users')
    .select('ugc_accepted_at')
    .eq('id', uid)
    .maybeSingle()
  if (error || !data) return false
  return !!(data as { ugc_accepted_at?: string | null }).ugc_accepted_at
}

/** Record acceptance for the current user (idempotent server-side). */
export async function acceptUgcTerms(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('accept_ugc_terms')
  if (error) throw error
}

/**
 * Reactive acceptance state for the current session. `ready` gates reads (avoids
 * flashing the gate before we know), `accepted` drives whether the compose flow
 * needs the terms sheet, and `markAccepted()` flips it locally after a
 * successful accept so the gate doesn't reappear this session.
 */
export function useUgcAccepted() {
  const [accepted, setAccepted] = useState(false)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (!uid) {
      setAccepted(false)
      setReady(true)
      return
    }
    const ok = await fetchUgcAccepted(supabase, uid)
    setAccepted(ok)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const markAccepted = useCallback(() => setAccepted(true), [])

  return { accepted, ready, refresh, markAccepted }
}
