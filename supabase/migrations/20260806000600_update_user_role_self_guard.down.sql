-- =============================================================================
-- DOWN migration for 20260806000600_update_user_role_self_guard.sql
--
-- Schema-clean AND fully data-lossless. Function bodies carry no data, and no
-- role assignment made under either version is affected by reverting.
--
-- Restores update_user_role() to the hand-hardened version that was live in
-- production on 2026-08-06, byte-for-byte as captured by pg_get_functiondef.
--
-- WARNING — this reopens the owner lockout. After reverting, an owner calling
-- update_user_role(<their own id>, 'user') will succeed and demote themselves,
-- and because 'owner' is not in the assignable whitelist there is no way back
-- through any RPC. With one owner account that is an unrecoverable state short of
-- direct SQL:
--
--   -- emergency owner restore, direct SQL only
--   BEGIN;
--   SELECT set_config('app.role_change_ok','1',true);
--   UPDATE public.users SET role='owner' WHERE id='<the owner uuid>';
--   COMMIT;
--
-- It also restores the behaviour where app.role_change_ok stays latched to '1'
-- for the remainder of the transaction after a role change.
--
-- Only run this if the self-guard is actively breaking a flow. If the problem is
-- narrower than that — say an admin legitimately needing to demote themselves —
-- prefer narrowing the new check to owners only rather than removing it:
--
--   IF target_user_id = auth.uid() AND caller_role = 'owner' THEN
--     RAISE EXCEPTION 'The owner cannot change their own role';
--   END IF;
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
END;
$function$;

REVOKE ALL    ON FUNCTION public.update_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO authenticated, service_role;
