-- =============================================================================
-- GraceChords: drop 'collaborator' from users_role_check (2026-08-06)
--
-- 20260708000000_remove_collaborator_role.sql retired the collaborator role. It
-- demoted every collaborator to user, dropped collaborator_requests and
-- is_collaborator_eligible(), and narrowed has_min_role(),
-- check_personal_setlist_limit() and update_user_role(). It never touched the
-- CHECK constraint, and no migration since has, so production still accepts the
-- value today:
--
--   CHECK (role = ANY (ARRAY['owner','admin','editor','collaborator','user']))
--
-- A row carrying that value would be strictly worse off than a plain user, not
-- better: has_min_role() has no 'collaborator' arm, so it falls through to
-- ELSE false and is granted nothing at all — not even 'user'. AGENTS.md:78 says
-- as much. The role therefore cannot escalate anything; the reason to remove it
-- from the constraint is that the database should refuse a value the application
-- has no meaning for, rather than accepting it and failing closed later.
--
-- Live role counts at the time of writing: user 48, admin 2, owner 1, editor 1 —
-- 52 accounts, zero collaborators. The guard below re-checks at apply time.
--
-- 'owner' stays in the list: exactly one row holds it, and it is settable only by
-- direct SQL now that update_user_role() excludes it from the assignable set.
--
-- Idempotent. Schema-clean and fully data-lossless in both directions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Refuse if the value is in use.
--
-- Narrowing a CHECK constraint against a table that violates it would fail
-- anyway, with a generic "check constraint is violated by some row". This turns
-- that into a message that names the problem and the count.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.users WHERE role = 'collaborator';
  IF n > 0 THEN
    RAISE EXCEPTION 'refusing: % user(s) still have role = collaborator — demote them first (see 20260708000000:16)', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Narrow the constraint.
--
-- Postgres has no ALTER CONSTRAINT for a CHECK expression, so this is a drop and
-- re-add. It takes a brief ACCESS EXCLUSIVE lock and validates all 52 rows —
-- negligible at this table size, but worth knowing it is not a metadata-only
-- change.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'user'::text]));
