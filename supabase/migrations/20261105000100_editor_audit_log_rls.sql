-- =============================================================================
-- GraceChords: create editor_audit_log with its access rules (2026-11-05)
--
-- Applying the first version of this file on 2026-11-05 showed that
-- public.editor_audit_log DOES NOT EXIST in production.
-- 20260312_song_editor.sql was meant to create it, but that part never reached
-- the live database. As a result, until this migration:
--
--   * every client audit write failed (EditorPage.jsx:375 logs and swallows the
--     error; MobileEditorPage.jsx:136 and packages/core songsWriteRepo.js:55
--     ignore or throw it);
--   * /portal/audit showed an error to admins;
--   * review_song_suggestion() as written in 20260708000400 (lines 83 and 145)
--     inserts into this table, so every approve and reject raised
--     "relation does not exist" and rolled back, if that is the version live.
--
-- Columns match 20260312_song_editor.sql and every current writer, except that
-- created_at is NOT NULL. The FK actor_id -> public.users is what lets
-- AuditLogPanel embed users(display_name).
--
-- Access:
--   SELECT  admins and owners only, matching the /portal/audit route guard
--           (apps/web/src/App.jsx:77).
--   INSERT  any signed-in user, only as themself (actor_id = auth.uid()). Every
--           client writer already sends the caller's own id.
--           review_song_suggestion() is SECURITY DEFINER and bypasses this.
--   UPDATE / DELETE  nobody: an audit log is append-only.
--
-- Creates one new, empty table and changes no existing rows. Idempotent: on a
-- database that already has the table, the CREATE is skipped and only the
-- access rules are (re)applied.
-- Revert: 20261105000100_editor_audit_log_rls.down.sql
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.editor_audit_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  action           text        NOT NULL CHECK (action IN (
                                 'direct_save','suggestion_submitted','approved',
                                 'rejected','deleted','touched_up')),
  song_id          uuid        REFERENCES public.songs(id) ON DELETE SET NULL,
  song_slug        text,
  song_title       text,
  payload_snapshot jsonb,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editor_audit_log_created_at_idx
  ON public.editor_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS editor_audit_log_actor_id_idx
  ON public.editor_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS editor_audit_log_song_id_idx
  ON public.editor_audit_log (song_id);

ALTER TABLE public.editor_audit_log ENABLE ROW LEVEL SECURITY;

-- Grants: RLS decides which rows; these decide which commands are even possible.
-- anon gets nothing, and authenticated gets only what the policies use.
REVOKE ALL ON TABLE public.editor_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.editor_audit_log TO authenticated;
GRANT ALL ON TABLE public.editor_audit_log TO service_role;

DROP POLICY IF EXISTS "auth_insert_audit"  ON public.editor_audit_log;
DROP POLICY IF EXISTS "admin_read_audit"   ON public.editor_audit_log;
DROP POLICY IF EXISTS "audit_insert_own"   ON public.editor_audit_log;

CREATE POLICY "admin_read_audit" ON public.editor_audit_log
  FOR SELECT TO authenticated
  USING (public.has_min_role('admin'));

CREATE POLICY "audit_insert_own" ON public.editor_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

COMMIT;

-- Make the new table visible to the API right away.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verification (run after applying):
--   select relrowsecurity from pg_class where oid = 'public.editor_audit_log'::regclass;  -- true
--   select policyname, cmd from pg_policies where tablename = 'editor_audit_log';
--     -- expect exactly: admin_read_audit (SELECT), audit_insert_own (INSERT)
-- Then, signed in: save a song in the editor and open /portal/audit as an admin.
-- The entry should be listed.
-- =============================================================================
