import { useAuth } from './useAuth'

// Role hierarchy: user < collaborator < editor < admin < owner

const ACTIONS = {
  suggest:         'collaborator',
  directSave:      'editor',
  suggestDeletion: 'collaborator',
  directDelete:    'admin',
  review:          'editor',
  viewAuditLog:    'admin',
}

/**
 * Returns { role, isAtLeast, can }
 *
 * isAtLeast(minRole) — true if current role >= minRole in the hierarchy
 * can(action) — where action is one of:
 *   'suggest' | 'directSave' | 'suggestDeletion' | 'directDelete' | 'review' | 'viewAuditLog'
 */
export function useRole() {
  const { role, hasMinRole } = useAuth()

  function isAtLeast(minRole) {
    return hasMinRole(minRole)
  }

  function can(action) {
    const required = ACTIONS[action]
    if (!required) return false
    return hasMinRole(required)
  }

  return { role, isAtLeast, can }
}
