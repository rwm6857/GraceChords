import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    let ignore = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (ignore) return
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => {
      ignore = true
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error) setProfile(data)
  }

  const value = {
    session,
    profile,
    loading: session === undefined,
    isLoggedIn: !!session,
    isEditor: ['admin', 'editor'].includes(profile?.global_role),
    isContributor: profile?.global_role != null,
    refreshProfile: () => session && fetchProfile(session.user.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
