import { useCallback } from 'react'
import { useAuth } from './useAuth'

// Role hierarchy: user < collaborator < editor < admin < owner

const ACTIONS = {
  suggest:         'collaborator',
  directSave:      'editor',
  suggestDeletion: 'collaborator',
  directDelete:    'admin',
  review:          'editor',
  viewAuditLog:    'admin',
  deletePptx:      'admin',
}

/**
 * Returns { role, isAtLeast, can }
 *
 * isAtLeast(minRole) — true if current role >= minRole in the hierarchy
 * can(action) — where action is one of:
 *   'suggest' | 'directSave' | 'suggestDeletion' | 'directDelete' | 'review' | 'viewAuditLog' | 'deletePptx'
 *
 * Both functions are memoized on `hasMinRole` so consumers can safely list
 * them in useEffect/useCallback dep arrays without re-running on every render.
 */
export function useRole() {
  const { role, hasMinRole } = useAuth()

  const isAtLeast = useCallback(
    (minRole) => hasMinRole(minRole),
    [hasMinRole]
  )

  const can = useCallback(
    (action) => {
      const required = ACTIONS[action]
      if (!required) return false
      return hasMinRole(required)
    },
    [hasMinRole]
  )

  return { role, isAtLeast, can }
}
