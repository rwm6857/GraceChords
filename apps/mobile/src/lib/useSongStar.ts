import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Per-song favorite toggle backed by `user_starred_songs` (uuid FK to
// songs.id, RLS-scoped to the signed-in user). Reads the star state for one
// song and writes optimistically: the UI flips immediately and reverts if the
// insert/delete fails. Complements the read-only `useStarredSongs` list.
export function useSongStar(songId: string | undefined) {
  const [starred, setStarred] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!songId) {
      setReady(false)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const uid = sessionData.session?.user?.id
        if (!uid) return
        const { data } = await supabase
          .from('user_starred_songs')
          .select('song_id')
          .eq('user_id', uid)
          .eq('song_id', songId)
          .maybeSingle()
        if (alive) setStarred(!!data)
      } catch {
        // Non-fatal: leave as not-starred; toggle will still try to write.
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [songId])

  const toggle = useCallback(async () => {
    if (!songId) return
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user?.id
    if (!uid) return
    const next = !starred
    setStarred(next) // optimistic
    try {
      if (next) {
        const { error } = await supabase
          .from('user_starred_songs')
          .upsert({ user_id: uid, song_id: songId }, { onConflict: 'user_id,song_id' })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('user_starred_songs')
          .delete()
          .eq('user_id', uid)
          .eq('song_id', songId)
        if (error) throw error
      }
    } catch {
      setStarred(!next) // revert on failure
    }
  }, [songId, starred])

  return { starred, ready, toggle }
}
