-- =============================================================================
-- DOWN migration for 20260806000500_users_grant_hardening.sql
--
-- Schema-clean AND fully data-lossless. Grants carry no data.
--
-- THIS IS THE FASTEST ROLLBACK IN THE SERIES and the one most likely to be
-- needed in a hurry. If a write path breaks after the up migration — most likely
-- the sprite save in the shipped iOS app (apps/mobile/src/lib/profile.ts:31),
-- which surfaces as "Profile row not found or not writable." — run this and the
-- previous behaviour is restored immediately. No app deploy is involved.
--
-- SECURITY NOTE. Restoring the table-wide UPDATE grant reopens the privilege that
-- made the role escalation reachable in the first place. It does NOT reopen the
-- escalation itself: guard_users_role_change() is a BEFORE UPDATE trigger on
-- public.users and is untouched by this file, so a direct PATCH of `role` still
-- raises 'role can only be changed via update_user_role()'. The trigger is the
-- primary control; the column grants were defence in depth. Do not also drop the
-- trigger while investigating.
--
-- Restores the exact prior state: all seven table privileges to anon and
-- authenticated, and no column-level grants of any kind.
--
-- Reverses in reverse order: column grant, then the table privileges.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Remove the column-level grant first.
--
-- If this ran after the table-wide GRANT below it would be a no-op in appearance
-- but would leave a redundant column ACL entry behind, so the state would not
-- match what production had before.
-- ---------------------------------------------------------------------------
REVOKE UPDATE (display_name, preferences) ON TABLE public.users FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Restore the table-wide privileges.
--
-- SELECT and INSERT were never revoked by the up migration and are not repeated
-- here. The five below are exactly what it took away.
-- ---------------------------------------------------------------------------
GRANT UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.users TO anon, authenticated;

-- =============================================================================
-- POST-REVERT CHECK:
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='users'
--     AND grantee IN ('anon','authenticated')
--   ORDER BY grantee, privilege_type;
--
-- Expected: seven rows per grantee (DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE), and no rows at all from column_privileges beyond that
-- table-level expansion.
-- =============================================================================
