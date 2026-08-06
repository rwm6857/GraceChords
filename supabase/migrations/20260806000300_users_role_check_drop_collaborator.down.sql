-- =============================================================================
-- DOWN migration for 20260806000300_users_role_check_drop_collaborator.sql
--
-- Schema-clean AND fully data-lossless. Widening a CHECK constraint cannot fail
-- on existing rows: every value the narrow constraint permitted is also permitted
-- by the wide one.
--
-- Restores the five-value constraint exactly as production carried it before,
-- including 'collaborator'.
--
-- Note what this does NOT restore: nothing in the application understands
-- 'collaborator' any more. has_min_role() has no arm for it (removed in
-- 20260708000000), so a row given that value would be granted nothing at all —
-- not even plain-user access. Widening the constraint makes the value storable
-- again; it does not make it functional. If you are reverting in order to
-- reinstate the role for real, 20260708000000 has to be reverted too.
-- =============================================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text,
                           'collaborator'::text, 'user'::text]));
