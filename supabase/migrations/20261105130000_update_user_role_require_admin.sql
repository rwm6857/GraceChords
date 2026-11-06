-- =============================================================================
-- GraceChords: update_user_role() must require an admin or owner caller (2026-11-05)
--
-- THE DEFECT
--
-- update_user_role() as defined in 20260806000600 checks the whitelist, blocks
-- self-targeting, blocks non-owners from assigning 'admin', limits admins to
-- editor/user, and protects the owner. It never checks that the caller is an
-- admin at all.
--
-- `authenticated` holds EXECUTE on it. It is SECURITY DEFINER and owned by
-- postgres (BYPASSRLS), and it sets app.role_change_ok, so
-- guard_users_role_change() lets its UPDATE through. For a caller whose role is
-- 'user' or 'editor':
--
--   * new_role = 'admin'          -> refused ('Insufficient privileges ...')
--   * caller_role = 'admin' check -> skipped (caller is not admin)
--   * target is owner             -> refused ('Cannot modify an owner account')
--   * anything else               -> ALLOWED
--
-- So any signed-in user can, with the anon key and a direct RPC call:
--   * promote any non-owner account to 'editor', including a second account
--     they control. Editors can hard-delete songs (songs_delete policy =
--     has_min_role('editor')) and edit the catalogue;
--   * demote any admin or editor to 'user'.
--
-- Found from the live function definition, grants and role attributes during
-- the Song Stats Phase 0 schema audit. Not exercised against production.
--
-- THE FIX
--
-- One new check, first in the body: IF NOT public.has_min_role('admin') THEN
-- RAISE. has_min_role() returns false for a NULL role (no session, no users
-- row, or an unrecognised role value), so this fails closed. It runs before the
-- whitelist so a non-admin learns nothing about which inputs would be accepted.
--
-- Everything else is unchanged from 20260806000600: same signature, same
-- whitelist, same self-guard, same privilege checks, same error messages, same
-- re-arming of app.role_change_ok, same SECURITY DEFINER and SET search_path TO
-- '', same REVOKE/GRANT.
--
-- Side effect worth knowing: a call with no user JWT (service_role key, or the
-- SQL editor as postgres) now has auth.uid() = NULL and is refused. Previously
-- such a caller could assign editor/user to any non-owner. Nothing in the repo
-- calls this RPC that way (the only caller is apps/web/src/pages/AdminPage.jsx,
-- behind the /admin RoleGuard), and the owner is set by direct SQL regardless.
--
-- APPLYING
--
-- Applied by hand in the Supabase dashboard SQL editor (or
-- `supabase db query --linked -f <this file>`), never `supabase db push` — see
-- AGENTS.md "Roles & auth". Idempotent (CREATE OR REPLACE); re-running it is a
-- no-op. Changes no rows. Revert: 20261105130000_update_user_role_require_admin.down.sql
-- (data-lossless, but it reopens the escalation).
--
-- Before applying, confirm the live function is the 20260806000600 version
-- (migrations have drifted from live before). It should contain
-- 'You cannot change your own role' and NOT contain has_min_role:
--
--   SELECT pg_get_functiondef('public.update_user_role(uuid,text)'::regprocedure);
--
-- VERIFICATION (read-only; run after applying)
--
--   -- 1. New guard present, earlier guards still present. Expect: t, t, t
--   SELECT d LIKE '%has_min_role(''admin'')%'           AS has_admin_guard,
--          d LIKE '%You cannot change your own role%'    AS has_self_guard,
--          d LIKE '%role_change_ok'', ''0''%'            AS rearms_flag
--   FROM (SELECT pg_get_functiondef('public.update_user_role(uuid,text)'::regprocedure) AS d) f;
--
--   -- 2. Still SECURITY DEFINER with an empty search_path, owned by postgres.
--   --    Expect: t | {search_path=""} | postgres
--   SELECT p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner)
--   FROM pg_proc p
--   WHERE p.oid = 'public.update_user_role(uuid,text)'::regprocedure;
--
--   -- 3. Grants unchanged. Expect: anon f, authenticated t, service_role t
--   SELECT r AS grantee,
--          has_function_privilege(r, 'public.update_user_role(uuid,text)', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) AS r;
--
-- Functional check (not read-only, so do it from the app, not the SQL editor):
-- signed in as a plain 'user', call
--   supabase.rpc('update_user_role', { target_user_id: <any non-owner id>, new_role: 'editor' })
-- and expect the error 'Insufficient privileges to change roles'. The Admin
-- Portal should behave exactly as before for an admin or owner.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_user_role(target_user_id uuid, new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  caller_role         text := public.get_user_role();
  target_current_role text;
BEGIN
  -- NEW: only admins and owners may change roles. has_min_role() is false for a
  -- NULL role, so a caller with no session or no users row is refused too.
  IF NOT public.has_min_role('admin') THEN
    RAISE EXCEPTION 'Insufficient privileges to change roles';
  END IF;

  IF new_role NOT IN ('admin','editor','user') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  SELECT role INTO target_current_role
  FROM public.users WHERE id = target_user_id;

  IF new_role = 'admin' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Insufficient privileges to assign role: %', new_role;
  END IF;

  IF caller_role = 'admin' AND new_role NOT IN ('editor','user') THEN
    RAISE EXCEPTION 'Admins can only assign editor or user roles';
  END IF;

  IF target_current_role = 'owner' AND caller_role != 'owner' THEN
    RAISE EXCEPTION 'Cannot modify an owner account';
  END IF;

  PERFORM set_config('app.role_change_ok', '1', true);
  UPDATE public.users SET role = new_role WHERE id = target_user_id;
  PERFORM set_config('app.role_change_ok', '0', true);
END;
$function$;

REVOKE ALL    ON FUNCTION public.update_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated, service_role;
