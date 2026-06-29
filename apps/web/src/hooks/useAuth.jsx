import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { hasMinRole as checkHasMinRole } from '../lib/roles'

const AuthContext = createContext(null)

const PROFILE_CACHE_KEY = 'gc_profile_cache'

function getCachedProfile() {
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch { return null }
}

function writeCachedProfile(profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
    else localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {}
}

export function AuthProvider({ children }) {
  // Single state object so session + profileLoading are always updated atomically,
  // preventing a transient render where session is set but profileLoading is still false.
  // Profile is seeded from localStorage so the navbar avatar renders on first paint,
  // eliminating the flash/shift when returning to the tab.
  const [authState, setAuthState] = useState(() => ({
    session: undefined, // undefined = not yet initialised
    profile: getCachedProfile(),
    profileLoading: false,
  }))

  const { session, profile } = authState

  useEffect(() => {
    let ignore = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (ignore) return
      if (newSession) {
        // Keep the existing (cached) profile while re-fetching so the navbar
        // avatar doesn't vanish on tab refocus / token refresh.
        // Only mark profileLoading when there is no profile to show yet.
        setAuthState(prev => ({
          session: newSession,
          profile: prev.profile,
          profileLoading: prev.profile === null,
        }))
        fetchProfile(newSession.user.id, () => ignore)
      } else {
        // Signed out — clear the cache so a subsequent visitor doesn't see
        // stale avatar data.
        writeCachedProfile(null)
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
    const newProfile = (!userError && userData) ? userData : null
    // Persist the freshly-fetched profile so the next page load / tab refocus
    // can render it immediately without waiting for this round-trip.
    writeCachedProfile(newProfile)
    // Atomically set profile + clear profileLoading in one update
    setAuthState(prev => ({
      ...prev,
      profile: newProfile,
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
