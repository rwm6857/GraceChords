-- =============================================================================
-- GraceChords: reflections table (2026-07-19)
--
-- Private, per-user reading reflections surfaced on the Daily Word landing and
-- the reflection journal. Phase 1 is PRIVATE-ONLY: every row is written with
-- visibility = 'private' and no other user's content is ever read. The
-- 'visibility' column + the (user_id, reflection_date, visibility) unique index
-- are forward-compatible with the Phase-2 public/anonymous feed, but no public
-- read path, feed, hearts, or moderation exist yet.
--
-- Design decisions baked into the schema:
--   * unique(user_id, reflection_date, visibility) enforces one entry per
--     visibility per day (one private reflection/day now; one public post/day
--     later) at the DB layer.
--   * NO update policy -> the no-edit rule is enforced by the database, not just
--     the UI. Reflections can be created and deleted, never edited.
--   * on delete cascade off auth.users -> covered by Apple's account-deletion
--     cascade (delete_user RPC).
--   * The insert policy's reflection_date BETWEEN current_date - 1 AND
--     current_date + 1 is the timezone posting window (a client a day ahead/
--     behind UTC can still post "today").
--   * content_key optionally links a reflection to the day's reading; it stays
--     NULL in Phase 1 because daily content is day-of-year keyed by the
--     M'Cheyne plan, so reflection_date already anchors the day.
--
-- Forward-only + idempotent, per repo convention. A documented rollback block
-- is at the bottom of this file.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reflections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reflection_date date        NOT NULL,
  content_key     text,                          -- optional link to the day's reading; nullable for now
  visibility      text        NOT NULL DEFAULT 'private'
                              CHECK (visibility IN ('private','public')),
  body            text        NOT NULL
                              CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One entry per visibility per day per user (one private reflection/day now;
-- already correct for the Phase-2 public post).
CREATE UNIQUE INDEX IF NOT EXISTS reflections_one_per_day
  ON public.reflections (user_id, reflection_date, visibility);

ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select" ON public.reflections;
DROP POLICY IF EXISTS "own_insert" ON public.reflections;
DROP POLICY IF EXISTS "own_delete" ON public.reflections;

-- Owners read only their own reflections. No public read path in this phase.
CREATE POLICY "own_select" ON public.reflections
  FOR SELECT USING (user_id = auth.uid());

-- Owners insert only their own, PRIVATE-only, within the ±1-day posting window.
CREATE POLICY "own_insert" ON public.reflections
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND visibility = 'private'
    AND reflection_date BETWEEN current_date - 1 AND current_date + 1
  );

-- Owners delete their own reflections.
CREATE POLICY "own_delete" ON public.reflections
  FOR DELETE USING (user_id = auth.uid());

-- Intentionally NO update policy: the no-edit rule is enforced at the DB layer.

-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration. Dropping
-- the table cascades away its unique index and all three RLS policies.
--
--   DROP TABLE IF EXISTS public.reflections CASCADE;
-- =============================================================================
