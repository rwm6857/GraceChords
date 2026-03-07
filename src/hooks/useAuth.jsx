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

  useEffect(() => {
    let ignore = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (ignore) return
      setSession(session)
      if (session) fetchProfile(session.user.id, () => ignore)
      else setProfile(null)
    })

    return () => {
      ignore = true
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId, isStale = () => false) {
    // Fetch main profile data from users table (existing behavior)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    // Also fetch role from profiles table (new role system)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role, account_created_at')
      .eq('id', userId)
      .maybeSingle()

    if (isStale()) return
    if (!userError && userData) {
      setProfile({
        ...userData,
        role: profileData?.role || 'user',
        account_created_at: profileData?.account_created_at || null,
      })
    } else if (profileData) {
      // Fallback: profiles table only
      setProfile(profileData)
    }
  }

  const role = profile?.role || 'user'

  const value = {
    session,
    profile,
    loading: session === undefined,
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
