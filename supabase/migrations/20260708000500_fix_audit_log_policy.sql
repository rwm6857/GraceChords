-- =============================================================================
-- GraceChords: Fix editor_audit_log admin read policy (2026-07-08)
--
-- admin_read_audit still references the dropped `global_role` column (the
-- column was renamed to `role`), so admins currently cannot read the audit log.
-- Rewrite it with the has_min_role() helper, matching the song_suggestions fix
-- in 20260522000000_advisor_hardening.sql.
-- =============================================================================

DROP POLICY IF EXISTS "admin_read_audit" ON public.editor_audit_log;
CREATE POLICY "admin_read_audit" ON public.editor_audit_log
  FOR SELECT USING (public.has_min_role('admin'));
