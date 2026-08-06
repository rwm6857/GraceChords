-- =============================================================================
-- GraceChords: stop update_user_role() changing the caller's own role (2026-08-06)
--
-- Two defects in the hand-hardened update_user_role(), both closed here.
--
-- 1. THE OWNER CAN LOCK THEMSELVES OUT, IRREVERSIBLY.
--
--    update_user_role(<own id>, 'user') called by the owner passes every existing
--    guard. The whitelist allows 'user'; `new_role = 'admin'` is false so the
--    privilege check is skipped; and the owner-protection check
--
--      IF target_current_role = 'owner' AND caller_role != 'owner'
--
--    is specifically written NOT to fire when the caller is the owner. The role
--    then changes owner → user. Because the same hardening removed 'owner' from
--    the assignable whitelist, there is no way back through any RPC: the only
--    remedy is direct SQL against the database. With exactly one owner account,
--    this is a single mis-click in the Admin Portal away from a product with no
--    owner at all.
--
--    apps/web/src/pages/AdminPage.jsx guards the self row in the UI, so no
--    legitimate flow is affected — but that guard is client-side, and the RPC is
--    callable directly by any authenticated user with the anon key. The database
--    should not depend on a dropdown for this.
--
--    Fixed by refusing any self-targeted role change, matching the shape
--    admin_delete_user() already uses ('You cannot delete your own account here').
--    An admin demoting themselves is blocked too; that is intentional and
--    consistent, and no client offers it.
--
-- 2. app.role_change_ok IS NEVER RE-ARMED.
--
--    The flag is set to '1' and left set for the remainder of the transaction, so
--    any later UPDATE to public.users.role in that same transaction also passes
--    guard_users_role_change(). Under PostgREST each request is its own
--    transaction, so this is not currently exploitable — but the guard is the
--    primary control for the escalation this whole series is about, and leaving it
--    latched open costs nothing to fix. It is reset immediately after the UPDATE.
--
-- Everything else about the function is untouched: same signature, same whitelist
-- ('admin','editor','user' — 'owner' remains unassignable), same privilege checks,
-- same error messages, same SECURITY DEFINER and search_path.
--
-- Idempotent (CREATE OR REPLACE). Fully reversible and data-lossless.
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
