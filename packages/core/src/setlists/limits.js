// Per-role personal setlist caps. Single source of truth for both apps; must
// stay in sync with the DB trigger public.check_personal_setlist_limit()
// (supabase/migrations/20260707000000_raise_personal_setlist_limits.sql).
// Owner is uncapped (Infinity).

export const PERSONAL_SETLIST_LIMITS = {
  user: 30,
  collaborator: 50,
  editor: 50,
  admin: 50,
  owner: Infinity,
}

// The personal setlist cap for a role. Unknown roles fall back to the base
// `user` cap, matching the trigger's ELSE branch.
export function personalSetlistLimit(role) {
  const limit = PERSONAL_SETLIST_LIMITS[role]
  return limit === undefined ? PERSONAL_SETLIST_LIMITS.user : limit
}
