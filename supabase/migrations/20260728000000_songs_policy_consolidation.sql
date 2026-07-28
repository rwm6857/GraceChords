-- =============================================================================
-- GraceChords: consolidate public.songs RLS policies (2026-07-28)
--
-- The live songs table had accumulated TEN policies across three naming
-- generations. Because permissive policies are OR'd together, the duplicates
-- were not merely untidy: `songs_select USING (true)` overrode both other SELECT
-- policies, so every row was readable by anyone — anon included — INCLUDING rows
-- with is_deleted = true. The `is_deleted = false` guarantee the apps depend on
-- was being enforced only by the client-side .eq() in each query, never by RLS.
--
-- This migration replaces all ten with exactly one policy per command. Semantics
-- are otherwise preserved: public SELECT of non-deleted rows, editor+
-- INSERT/UPDATE/DELETE. The draft/published visibility rule is deliberately NOT
-- here — it lands in 20260728000100_songs_status.sql — so this file can be
-- reviewed as the security fix it is.
--
-- Effective DELETE was ALREADY editor+, not admin+: songs_delete's admin+ check
-- was OR'd with two editor+ grants ("Admins and editors can delete songs" and
-- the cmd=ALL songs_write_editor). This migration makes that explicit rather
-- than changing who can delete.
--
-- Superseded policies, verbatim from pg_policies (the down migration restores
-- them exactly):
--   songs_select                          SELECT  USING (true)
--   "Songs are publicly readable"         SELECT  USING (is_deleted = false)
--   "Authenticated users can read songs"  SELECT  USING (auth.uid() IS NOT NULL AND is_deleted = false)
--   songs_insert                          INSERT  WITH CHECK (has_min_role('editor'))
--   "Admins and editors can insert songs" INSERT  WITH CHECK (has_min_role('editor'))
--   songs_update                          UPDATE  USING (has_min_role('editor'))
--   "Admins and editors can update songs" UPDATE  USING (has_min_role('editor'))
--   songs_delete                          DELETE  USING (has_min_role('admin'))
--   "Admins and editors can delete songs" DELETE  USING (has_min_role('editor'))
--   songs_write_editor                    ALL     USING + WITH CHECK
--       (EXISTS (SELECT 1 FROM users u
--                WHERE u.id = auth.uid()
--                  AND u.role = ANY (ARRAY['editor','admin','owner'])))
--
-- The inline `EXISTS (SELECT ... FROM users)` form in songs_write_editor is
-- replaced by public.has_min_role(), for the reason 20260522000000 gives: an
-- inlined role list has to be found and edited every time the hierarchy changes,
-- and one of these already drifted (users.global_role → users.role).
-- =============================================================================

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1. Drop every existing policy on public.songs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "songs_select"                         ON public.songs;
DROP POLICY IF EXISTS "Songs are publicly readable"          ON public.songs;
DROP POLICY IF EXISTS "Authenticated users can read songs"   ON public.songs;
DROP POLICY IF EXISTS "songs_insert"                         ON public.songs;
DROP POLICY IF EXISTS "Admins and editors can insert songs"  ON public.songs;
DROP POLICY IF EXISTS "songs_update"                         ON public.songs;
DROP POLICY IF EXISTS "Admins and editors can update songs"  ON public.songs;
DROP POLICY IF EXISTS "songs_delete"                         ON public.songs;
DROP POLICY IF EXISTS "Admins and editors can delete songs"  ON public.songs;
DROP POLICY IF EXISTS "songs_write_editor"                   ON public.songs;

-- ---------------------------------------------------------------------------
-- 2. One canonical policy per command
-- ---------------------------------------------------------------------------

-- Public read, matching the original intent of "Songs are publicly readable":
-- the catalog is browsable without a session (apps/web serves public song pages,
-- and Studio's SongsRepository documents reads as session-free). Soft-deleted
-- rows are now genuinely excluded by RLS, not just by the client's filter.
CREATE POLICY "songs_select"
  ON public.songs FOR SELECT
  USING (is_deleted = false);

-- Writes are editor+ (packages/core's canDirectWrite). Scoped TO authenticated:
-- has_min_role('editor') already returns false for anon (get_user_role() is NULL
-- with no auth.uid(), which falls through to ELSE false), so this changes no
-- behaviour — it just stops the policy from being evaluated for anon at all.
CREATE POLICY "songs_insert"
  ON public.songs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_min_role('editor'));

CREATE POLICY "songs_update"
  ON public.songs FOR UPDATE
  TO authenticated
  USING (public.has_min_role('editor'))
  WITH CHECK (public.has_min_role('editor'));

CREATE POLICY "songs_delete"
  ON public.songs FOR DELETE
  TO authenticated
  USING (public.has_min_role('editor'));
