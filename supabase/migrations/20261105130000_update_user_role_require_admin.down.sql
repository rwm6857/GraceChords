-- =============================================================================
-- DOWN migration for 20261105130000_update_user_role_require_admin.sql
--
-- Schema-clean AND fully data-lossless. Function bodies carry no data, and no
-- role assignment made under either version is affected by reverting.
--
-- Restores update_user_role() to the 20260806000600_update_user_role_self_guard.sql
-- definition: identical except that the has_min_role('admin') caller check is
-- removed. The body below is copied verbatim from that file, including its two
-- "NEW:" comments, so the restored pg_get_functiondef matches it exactly.
--
-- WARNING — this reopens privilege escalation. After reverting, ANY signed-in
-- user can call update_user_role() directly with the anon key to promote any
-- non-owner account (including a second account they control) to 'editor', or
-- to demote any admin or editor to 'user'. Only run this if the caller check is
-- actively breaking a legitimate flow, and re-apply the up migration as soon as
-- that flow is fixed.
--
-- Applied by hand in the Supabase dashboard SQL editor, like the up migration.
-- Idempotent (CREATE OR REPLACE).
--
-- Verify (read-only). Expect: f, t
--   SELECT d LIKE '%has_min_role(''admin'')%'        AS has_admin_guard,
--          d LIKE '%You cannot change your own role%' AS has_self_guard
--   FROM (SELECT pg_get_functiondef('public.update_user_role(uuid,text)'::regprocedure) AS d) f;
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
  IF new_role NOT IN ('admin','editor','user') THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  -- NEW: no self-targeted role changes. Closes the owner lockout described above.
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
  -- NEW: re-arm the guard immediately rather than leaving it set for the rest of
  -- the transaction.
  PERFORM set_config('app.role_change_ok', '0', true);
END;
$function$;

REVOKE ALL    ON FUNCTION public.update_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated, service_role;
