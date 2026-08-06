import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { fetchLastSetSummary, summarizeSet } from '@gracechords/core'
import { supabase } from './supabase'
import { reportFailure } from './errors'

// Summary of the user's most recently edited setlist for Home's "Last set"
// card (replaces the getLastSet() stub that lived in recents.ts).
export type Setlist = {
  id: string
  name: string
  songCount: number
  durationMin: number
  /** e.g. "G–D" for the key range badge; optional. */
  keys?: string
  updatedAt?: string
}

// i18n key for the user-facing failure — never the raw error. See errors.ts.
const LOAD_ERROR_KEY = 'errors:load.lastSet'

// The most recently updated personal setlist, summarized.
//
// Refetches on every focus of the owning screen, deliberately. Setlists are
// server-only and every write funnels through three core functions reached from
// ten mobile call sites, three of which bypass the useSetlists wrapper and call
// core directly (SetlistBuilderScreen's newSet, and both writes in
// SetlistImportScreen). A mount-only fetch plus mutation-driven invalidation
// would be correct only while every one of those sites remembers to signal, and
// the cost of one missed signal is a permanently stale card — worse than the one
// `setlists` query per tab switch this would save. Left as focus-driven on
// purpose; revisit if a shared setlist store ever lands.
export function useLastSet() {
  const [lastSet, setLastSet] = useState<Setlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    fetchLastSetSummary(supabase)
      .then((data: Awaited<ReturnType<typeof fetchLastSetSummary>>) => {
        if (!alive) return
        if (!data) {
          setLastSet(null)
          setError(null)
          return
        }
        const summary = summarizeSet(data.entries)
        setLastSet({
          id: data.id,
          name: data.name,
          songCount: summary.songCount,
          durationMin: summary.durationMin,
          keys: summary.keys ?? undefined,
          updatedAt: data.updated_at,
        })
        setError(null)
      })
      .catch((err: unknown) => {
        // A failed refetch deliberately leaves the previous `lastSet` in place:
        // with the error now consumed by Home, that reads as stale-with-warning
        // rather than as a silent lie. Before 1.0.1 Home discarded `error`
        // entirely, so a failure rendered nothing at all — indistinguishable
        // from "no setlists yet", with no way to retry.
        if (reportFailure('useLastSet', err) && alive) setError(LOAD_ERROR_KEY)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useFocusEffect(load)

  return { lastSet, loading, error, retry: load }
}
