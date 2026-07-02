import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { fetchLastSetSummary, summarizeSet } from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'

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

// The most recently updated personal setlist, summarized. Refetches whenever
// the owning screen regains focus so edits in the builder show up on Home.
export function useLastSet() {
  const [lastSet, setLastSet] = useState<Setlist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
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
          if (alive) setError(errMessage(err))
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, []),
  )

  return { lastSet, loading, error }
}
