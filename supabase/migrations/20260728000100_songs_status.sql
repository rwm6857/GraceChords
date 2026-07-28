-- =============================================================================
-- GraceChords: draft/published status on public.songs (2026-07-28)
--
-- Adds the lifecycle column GraceChords Studio's editor needs, and teaches the
-- SELECT policy to hide drafts from everyone below editor.
--
-- Requires 20260728000000_songs_policy_consolidation.sql to be applied first.
-- Before that consolidation this migration would have been a NO-OP: the live
-- table carried `songs_select USING (true)`, and because permissive policies are
-- OR'd, that policy alone would have kept handing every draft to every anonymous
-- visitor no matter what clause was added here.
--
-- Two states only — 'draft' and 'published'. public.personal_songs.status has
-- four ('draft','submitted','published','archived') because it participates in
-- the submission/review queue; this column deliberately does not.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
-- DEFAULT 'published' is load-bearing, not a stylistic choice. Every row that
-- exists today is live content. With DEFAULT 'draft' the entire catalog would
-- vanish from web, mobile and Studio the moment the policy below is created.
-- NOT NULL + DEFAULT 'published' backfills every existing row correctly in the
-- same statement, so no separate UPDATE is needed. New drafts set it explicitly.
ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

-- Added separately so re-running the migration on a table that already has the
-- column still installs the constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.songs'::regclass
      AND conname  = 'songs_status_check'
  ) THEN
    ALTER TABLE public.songs
      ADD CONSTRAINT songs_status_check CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

-- The SELECT policy filters on status for every catalog query, including anon's.
CREATE INDEX IF NOT EXISTS songs_status_idx ON public.songs (status);

-- ---------------------------------------------------------------------------
-- 2. Draft visibility
-- ---------------------------------------------------------------------------
-- Regular users and anon see published rows only. Editor+ additionally sees
-- drafts, which is what lets Studio's Manage section list them.
--
-- Clause order matters for cost: `status = 'published'` short-circuits before
-- has_min_role() is consulted, so the anon path never calls it. has_min_role()
-- is STABLE SECURITY DEFINER, so on the editor path Postgres evaluates it once
-- per query rather than once per row — the same property 20260609000000 was
-- written to preserve.
DROP POLICY IF EXISTS "songs_select" ON public.songs;

CREATE POLICY "songs_select"
  ON public.songs FOR SELECT
  USING (
    is_deleted = false
    AND (status = 'published' OR public.has_min_role('editor'))
  );
