import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function StarButton({ songId }) {
  const { isLoggedIn, session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [starred, setStarred] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!isLoggedIn || !session || !songId) {
      setChecking(false)
      return
    }
    supabase
      .from('user_starred_songs')
      .select('song_id')
      .eq('user_id', session.user.id)
      .eq('song_id', songId)
      .maybeSingle()
      .then(({ data }) => {
        setStarred(!!data)
        setChecking(false)
      })
  }, [isLoggedIn, session, songId])

  async function handleClick() {
    if (!isLoggedIn) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
      return
    }
    const wasStarred = starred
    setStarred(!wasStarred) // optimistic update
    if (wasStarred) {
      const { error } = await supabase
        .from('user_starred_songs')
        .delete()
        .eq('user_id', session.user.id)
        .eq('song_id', songId)
      if (error) setStarred(wasStarred) // revert on error
    } else {
      const { error } = await supabase
        .from('user_starred_songs')
        .insert({ user_id: session.user.id, song_id: songId })
      if (error) setStarred(wasStarred) // revert on error
    }
  }

  return (
    <button
      className={`gc-star-btn${starred ? ' starred' : ''}`}
      onClick={handleClick}
      aria-label={starred ? 'Unstar song' : 'Star song'}
      aria-pressed={starred}
      disabled={checking}
      title={starred ? 'Remove from starred' : 'Star this song'}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </button>
  )
}
