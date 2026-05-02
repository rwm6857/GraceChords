// Role hierarchy: lowest privilege → highest. Single source of truth for the
// frontend. The Cloudflare Worker (workers/pptx-upload/src/index.js) keeps its
// own copy because it's bundled separately; if you change the hierarchy, mirror
// it there too.

export const ROLE_ORDER = ['user', 'collaborator', 'editor', 'admin', 'owner']

// Same list, highest → lowest. Useful for role-picker UIs that show the most
// powerful option first.
export const ROLES_BY_RANK_DESC = [...ROLE_ORDER].reverse()

export function hasMinRole(userRole, minRole) {
  const userIdx = ROLE_ORDER.indexOf(userRole || 'user')
  const minIdx = ROLE_ORDER.indexOf(minRole || 'user')
  if (minIdx < 0) return false
  return userIdx >= minIdx
}
