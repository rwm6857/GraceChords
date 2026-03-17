import { createContext, useCallback, useContext, useEffect, useState } from 'react'
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
  // Single state object so session + profileLoading are always updated atomically,
  // preventing a transient render where session is set but profileLoading is still false.
  const [authState, setAuthState] = useState({
    session: undefined, // undefined = not yet initialised
    profile: null,
    profileLoading: false,
  })

  const { session, profile } = authState

  useEffect(() => {
    let ignore = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (ignore) return
      if (newSession) {
        // Atomically mark session known + profile in-flight
        setAuthState({ session: newSession, profile: null, profileLoading: true })
        fetchProfile(newSession.user.id, () => ignore)
      } else {
        setAuthState({ session: null, profile: null, profileLoading: false })
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
    // Atomically set profile + clear profileLoading in one update
    setAuthState(prev => ({
      ...prev,
      profile: (!userError && userData) ? userData : null,
      profileLoading: false,
    }))
  }

  const role = profile?.role || 'user'

  const hasMinRole = useCallback(
    (minRole) => checkHasMinRole(role, minRole),
    [role]
  )

  const value = {
    session,
    profile,
    loading: authState.session === undefined || authState.profileLoading,
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
    hasMinRole,
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
