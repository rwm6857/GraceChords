-- =============================================================================
-- GraceChords: Reconcile SECURITY DEFINER functions with the live DB
-- (Admin Portal role-change / user-delete repair + drift audit, 2026-06-09)
--
-- Context: the live database had drifted from the repo. Several SECURITY
-- DEFINER functions defined with `SET search_path = ''` either referenced
-- helpers/tables WITHOUT schema qualification (which cannot resolve under an
-- empty search_path, raising SQLSTATE 42883) or pointed at objects that no
-- longer exist. This migration brings the live DB back in line with the repo.
--
-- Companion to 20260609000000_admin_read_all_users.sql, which already repaired
-- get_user_role() and has_min_role(). This file covers the remaining functions
-- the Admin Portal and Profile page depend on.
--
-- Audit result (all 19 public SECURITY DEFINER functions reviewed):
--   • Clean / correctly qualified — no change needed:
--       get_user_role, has_min_role, is_collaborator_eligible, is_team_member,
--       handle_new_user, update_song_star_count, songs_search_titles_refresh,
--       check_personal_setlist_limit, check_team_setlist_limit,
--       check_team_membership_limit, check_team_leader_limit.
--   • Repaired here:
--       update_user_role     — drifted body called get_user_role() unqualified.
--       admin_delete_user    — did not exist in the DB at all; the app RPC
--                              (AdminPage delete button) had no backing function.
--       delete_user          — deleted from public.contributor_requests, a table
--                              that does not exist (the real table is
--                              collaborator_requests, which cascades from
--                              public.users anyway). Reduced to the auth.users
--                              delete and let FK cascade handle dependents.
--       is_global_admin      — called the dropped current_user_global_role();
--                              rewritten to use get_user_role().
--   • Left untouched — dormant legacy, unused by app and by all RLS policies,
--     and referencing tables/types that do not exist anywhere
--     (contributor_invites, contributor_requests, song_proposals, global_role):
--       claim_contributor_invite, review_contributor_request,
--       review_song_proposal. Recreating them would fail to resolve their
--       %rowtype declarations. Flagged for a separate cleanup/drop decision.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- update_user_role — re-assert canonical schema-qualified body.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role         text := public.get_user_role();
  target_current_role text;
BEGIN
  IF new_role NOT IN ('owner','admin','editor','collaborator','user') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  SELECT role INTO target_current_role
  FROM public.users WHERE id = target_user_id;

  IF new_role IN ('owner','admin') AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Insufficient privileges to assign role: %', new_role;
  END IF;

  IF caller_role = 'admin' AND new_role NOT IN ('editor','collaborator','user') THEN
    RAISE EXCEPTION 'Admins can only assign editor, collaborator, or user roles';
  END IF;

  IF target_current_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot modify an owner account';
  END IF;

  UPDATE public.users SET role = new_role WHERE id = target_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_user_role(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- admin_delete_user — create (the app RPC had no backing function).
-- Owner-only; cannot delete self. Cascades from auth.users handle dependents.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text := public.get_user_role();
BEGIN
  IF caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can delete user accounts';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account here';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- delete_user — drop the delete against the non-existent contributor_requests
-- table; FK cascade from auth.users → public.users → collaborator_requests
-- (and user_starred_songs) already removes dependent rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL  ON FUNCTION public.delete_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;


-- ---------------------------------------------------------------------------
-- is_global_admin — replace the dropped current_user_global_role() call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.get_user_role() = 'admin';
$$;
