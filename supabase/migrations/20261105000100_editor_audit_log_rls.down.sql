-- =============================================================================
-- Revert 20261105000100_editor_audit_log_rls.sql
--
-- Data-lossless as written: removes the access rules, so the table becomes
-- unusable from the apps again, but keeps any audit entries it collected.
--
-- Production had no editor_audit_log before 2026-11-05. Returning to that exact
-- state means also dropping the table, which DELETES every audit entry and
-- breaks review_song_suggestion() again. That line is left commented out on
-- purpose.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "audit_insert_own" ON public.editor_audit_log;
DROP POLICY IF EXISTS "admin_read_audit" ON public.editor_audit_log;

-- DROP TABLE IF EXISTS public.editor_audit_log;   -- data-lossy; see header

COMMIT;
