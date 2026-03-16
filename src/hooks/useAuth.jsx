import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const ROLE_ORDER = ['user', 'collaborator', 'editor', 'admin', 'owner']

function checkHasMinRole(userRole, minRole) {
  const userIdx = ROLE_ORDER.indexOf(userRole || 'user')
  const minIdx = ROLE_ORDER.indexOf(minRole || 'user')
  if (minIdx < 0) return false
  return userIdx >= minIdx
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let ignore = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (ignore) return
      setSession(session)
      if (session) {
        setProfileLoading(true)
        fetchProfile(session.user.id, () => ignore)
      } else {
        setProfile(null)
        setProfileLoading(false)
      }
    })

    return () => {
      ignore = true
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId, isStale = () => false) {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (isStale()) return
    if (!userError && userData) {
      setProfile(userData)
    }
    setProfileLoading(false)
  }

  const role = profile?.role || 'user'

  const value = {
    session,
    profile,
    loading: session === undefined || profileLoading,
    isLoggedIn: !!session,
    // Legacy fields kept for backward compat
    isEditor: ['admin', 'editor', 'owner'].includes(role),
    isContributor: profile?.global_role != null || checkHasMinRole(role, 'collaborator'),
    refreshProfile: () => session && fetchProfile(session.user.id),
    // New role system
    role,
    isOwner: role === 'owner',
    isAdmin: checkHasMinRole(role, 'admin'),
    isEditorRole: checkHasMinRole(role, 'editor'),
    isCollaborator: checkHasMinRole(role, 'collaborator'),
    hasMinRole: (minRole) => checkHasMinRole(role, minRole),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return {
      session: null,
      profile: null,
      loading: false,
      isLoggedIn: false,
      isEditor: false,
      isContributor: false,
      refreshProfile: () => {},
      role: 'user',
      isOwner: false,
      isAdmin: false,
      isEditorRole: false,
      isCollaborator: false,
      hasMinRole: () => false,
    }
  }
  return ctx
}
