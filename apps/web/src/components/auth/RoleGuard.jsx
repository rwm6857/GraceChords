import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { showToast } from '../../utils/app/toast'

/**
 * Redirects to / with a toast if the current user does not meet minRole.
 *
 * Usage:
 *   <RoleGuard minRole="admin">
 *     <AdminPage />
 *   </RoleGuard>
 */
export default function RoleGuard({ minRole, children }) {
  const { hasMinRole, loading, isLoggedIn } = useAuth()
  const navigate = useNavigate()

  // Track whether we've ever successfully confirmed the user is permitted.
  // Once confirmed, we never redirect due to a transient loading state
  // (e.g. a background token refresh that briefly sets profile to null).
  const wasPermittedRef = useRef(false)

  const permitted = isLoggedIn && hasMinRole(minRole)

  if (!loading && permitted) {
    wasPermittedRef.current = true
  }

  useEffect(() => {
    // Don't act while auth is still initialising or re-fetching profile
    if (loading) return
    // Don't redirect if the user was previously confirmed as permitted --
    // this prevents a background token refresh from kicking them out.
    if (wasPermittedRef.current) return
    // Only redirect once auth has fully settled and user is not permitted
    if (!isLoggedIn || !hasMinRole(minRole)) {
      showToast("You don't have permission to access that page.")
      navigate('/', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // While loading: if we've previously confirmed access, keep rendering children
  // so there's no flash or layout break during a background token refresh.
  if (loading) return wasPermittedRef.current ? children : null
  if (!permitted) return null
  return children
}
