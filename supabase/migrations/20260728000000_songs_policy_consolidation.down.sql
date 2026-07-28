-- =============================================================================
-- DOWN migration for 20260728000000_songs_policy_consolidation.sql
--
-- Restores all ten pre-consolidation policies verbatim, as captured from
-- pg_policies on 2026-07-28.
--
-- WARNING — this reopens a real hole. `songs_select USING (true)` is permissive
-- and OR's with everything else, so restoring it makes every row in public.songs
-- readable by anyone, including rows with is_deleted = true. Only run this if you
-- are reverting the whole change set; do not leave the database in this state.
--
-- Apply 20260728000100_songs_status.down.sql FIRST if that migration is also
-- applied — it rewrites songs_select, and this file recreates it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the consolidated policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "songs_select" ON public.songs;
DROP POLICY IF EXISTS "songs_insert" ON public.songs;
DROP POLICY IF EXISTS "songs_update" ON public.songs;
DROP POLICY IF EXISTS "songs_delete" ON public.songs;

-- ---------------------------------------------------------------------------
-- 2. Restore the original ten
-- ---------------------------------------------------------------------------

-- SELECT (three overlapping policies; the first makes the other two moot)
CREATE POLICY "songs_select"
  ON public.songs FOR SELECT
  USING (true);

CREATE POLICY "Songs are publicly readable"
  ON public.songs FOR SELECT
  USING (is_deleted = false);

CREATE POLICY "Authenticated users can read songs"
  ON public.songs FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_deleted = false);

-- INSERT (duplicate pair)
CREATE POLICY "songs_insert"
  ON public.songs FOR INSERT
  WITH CHECK (public.has_min_role('editor'));

CREATE POLICY "Admins and editors can insert songs"
  ON public.songs FOR INSERT
  WITH CHECK (public.has_min_role('editor'));

-- UPDATE (duplicate pair; neither carried a WITH CHECK, so Postgres reuses USING)
CREATE POLICY "songs_update"
  ON public.songs FOR UPDATE
  USING (public.has_min_role('editor'));

CREATE POLICY "Admins and editors can update songs"
  ON public.songs FOR UPDATE
  USING (public.has_min_role('editor'));

-- DELETE (admin+ and editor+ OR'd together, i.e. effectively editor+)
CREATE POLICY "songs_delete"
  ON public.songs FOR DELETE
  USING (public.has_min_role('admin'));

CREATE POLICY "Admins and editors can delete songs"
  ON public.songs FOR DELETE
  USING (public.has_min_role('editor'));

-- cmd=ALL, with the inline users lookup rather than has_min_role()
CREATE POLICY "songs_write_editor"
  ON public.songs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = ANY (ARRAY['editor'::text, 'admin'::text, 'owner'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = ANY (ARRAY['editor'::text, 'admin'::text, 'owner'::text])
    )
  );
