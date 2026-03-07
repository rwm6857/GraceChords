import { useEffect } from 'react'
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

  const permitted = !loading && isLoggedIn && hasMinRole(minRole)

  useEffect(() => {
    if (loading) return
    if (!isLoggedIn || !hasMinRole(minRole)) {
      showToast("You don't have permission to access that page.")
      navigate('/', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  if (loading) return null
  if (!permitted) return null
  return children
}
