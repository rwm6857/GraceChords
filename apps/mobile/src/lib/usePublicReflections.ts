import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMyHeartedIds,
  fetchMyPublicPost,
  fetchPublicFeed,
  fetchPublicReflectionsEnabled,
  heartReflection,
  unheartReflection,
  type PublicReflection,
} from '@gracechords/core'
import { supabase } from './supabase'
import { errMessage } from './errors'
import { reflectionDateKey } from './useReflections'
import { useHiddenPosts } from './hiddenPosts'

// Client hooks for the anonymous public feed + hearts. Reads never expose author
// identity (the core feed query selects id/body/heart_count only). The DB
// enforces the kill switch / today-only / not-banned independently, so these
// hooks only drive what the UI renders.

const LOAD_ERROR = 'Couldn’t load community reflections.'

/** The public_reflections kill switch. Gates whether the feed + public compose render. */
export function usePublicReflectionsEnabled() {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const on = await fetchPublicReflectionsEnabled(supabase)
        if (alive) setEnabled(on)
      } catch {
        if (alive) setEnabled(false)
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return { enabled, ready }
}

/** The current user's OWN public post for today (or null) — the compose slot. */
export function useMyPublicPost() {
  const [post, setPost] = useState<PublicReflection | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user?.id
      if (!uid) {
        setPost(null)
        return
      }
      setPost(await fetchMyPublicPost(supabase, uid, reflectionDateKey(new Date())))
    } catch (err: unknown) {
      console.error('[useMyPublicPost]', errMessage(err))
      setPost(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { post, loading, refresh }
}

export type FeedPost = {
  id: string
  body: string
  heart_count: number
  hearted: boolean
  isOwn: boolean
}

/**
 * Today's anonymous feed with optimistic hearts. Locally-hidden posts are
 * filtered out reactively. The user's own post is flagged `isOwn` (heart control
 * hidden) by matching the separately-fetched own-post id — the feed payload
 * itself never carries user_id.
 */
export function usePublicFeed() {
  const [raw, setRaw] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hidden = useHiddenPosts()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user?.id
      const today = reflectionDateKey(new Date())

      const feed = await fetchPublicFeed(supabase)
      const ids = feed.map((p) => p.id)
      const [heartedIds, myPost] = await Promise.all([
        uid ? fetchMyHeartedIds(supabase, ids) : Promise.resolve<string[]>([]),
        uid ? fetchMyPublicPost(supabase, uid, today) : Promise.resolve(null),
      ])
      const heartedSet = new Set(heartedIds)
      const myId = myPost?.id ?? null

      setRaw(
        feed.map((p) => ({
          id: p.id,
          body: p.body,
          heart_count: p.heart_count ?? 0,
          hearted: heartedSet.has(p.id),
          isOwn: p.id === myId,
        })),
      )
      setError(null)
    } catch (err: unknown) {
      console.error('[usePublicFeed]', errMessage(err))
      setError(LOAD_ERROR)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The user's own post is never served back to them in the community feed —
  // they read it (with its live heart count) in their own "Shared reflection"
  // slot instead. Everyone else sees it in their feed with the heart count.
  const posts = useMemo(
    () => raw.filter((p) => !p.isOwn && !hidden.has(p.id)),
    [raw, hidden],
  )

  // Optimistic heart toggle: flip + adjust the local count, revert on failure.
  // Own posts and self-hearts are refused (UI hides the control; RLS backstops).
  const toggleHeart = useCallback(async (id: string) => {
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user?.id
    if (!uid) return

    let target: FeedPost | undefined
    setRaw((prev) =>
      prev.map((p) => {
        if (p.id !== id || p.isOwn) return p
        target = p
        const next = !p.hearted
        return { ...p, hearted: next, heart_count: Math.max(0, p.heart_count + (next ? 1 : -1)) }
      }),
    )
    if (!target) return
    const wantHeart = !target.hearted
    try {
      if (wantHeart) await heartReflection(supabase, uid, id)
      else await unheartReflection(supabase, uid, id)
    } catch {
      // Revert to the pre-toggle state.
      setRaw((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, hearted: !wantHeart, heart_count: Math.max(0, p.heart_count + (wantHeart ? -1 : 1)) }
            : p,
        ),
      )
    }
  }, [])

  return { posts, loading, error, refresh, toggleHeart }
}
