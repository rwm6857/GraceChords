-- =============================================================================
-- DOWN migration for 20260728000100_songs_status.sql
--
-- Reverts the schema cleanly: the status column, its constraint, its index, and
-- the draft clause in songs_select all go away, leaving the table exactly as
-- 20260728000000_songs_policy_consolidation.sql left it.
--
-- WARNING — this is schema-clean but NOT data-lossless. Dropping the column
-- discards which songs were drafts, and because the restored policy no longer
-- filters on status, every former draft becomes immediately visible to everyone
-- including anon. If you are reverting only to change the editor UI and want to
-- keep draft state, run just the DROP POLICY / CREATE POLICY block below and
-- leave the column in place — an unused status column is harmless.
--
-- Run this BEFORE 20260728000000_songs_policy_consolidation.down.sql, since that
-- file recreates songs_select from scratch.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restore the consolidated SELECT policy (no status clause)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "songs_select" ON public.songs;

CREATE POLICY "songs_select"
  ON public.songs FOR SELECT
  USING (is_deleted = false);

-- ---------------------------------------------------------------------------
-- 2. Remove the column, its constraint and its index
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.songs_status_idx;

ALTER TABLE public.songs DROP CONSTRAINT IF EXISTS songs_status_check;

ALTER TABLE public.songs DROP COLUMN IF EXISTS status;
