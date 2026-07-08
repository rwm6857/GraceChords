-- =============================================================================
-- GraceChords: Reconcile song_suggestions for personal-song submissions (2026-07-08)
--
-- The live table already uses `type` (the migration files still say
-- `change_type`) and lacks `rejection_reason`, and its `song_id` is NOT NULL —
-- which is why the web submit/reject flow errors today. This migration makes
-- the table support the personal-songs submit → review flow and opens
-- submission to any authenticated user (the `collaborator` gate is gone).
--
-- Design: `song_id` (nullable, FK → songs) is the PUBLISHED target for
-- 'edit'/'deletion' and NULL for a brand-new 'addition'; `personal_song_id`
-- (FK → personal_songs) links back to the owner's draft snapshot.
-- =============================================================================

-- 1. Reconcile the `change_type` → `type` drift (no-op on the live DB).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='song_suggestions' AND column_name='change_type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='song_suggestions' AND column_name='type') THEN
    ALTER TABLE public.song_suggestions RENAME COLUMN change_type TO type;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='song_suggestions_type_check'
                   AND conrelid='public.song_suggestions'::regclass) THEN
    ALTER TABLE public.song_suggestions
      ADD CONSTRAINT song_suggestions_type_check CHECK (type IN ('addition','edit','deletion'));
  END IF;
END $$;

-- 2. Additions have no published song yet → allow NULL song_id. The FK to
--    songs(id) stays (NULL satisfies it); edits/deletions still point at a real
--    published song.
ALTER TABLE public.song_suggestions ALTER COLUMN song_id DROP NOT NULL;

-- 3. Link a suggestion to the draft it was submitted from, and store a reason.
ALTER TABLE public.song_suggestions
  ADD COLUMN IF NOT EXISTS personal_song_id uuid REFERENCES public.personal_songs(id) ON DELETE CASCADE;
ALTER TABLE public.song_suggestions
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS song_suggestions_personal_song_id_idx
  ON public.song_suggestions (personal_song_id);

-- 4. Any authenticated user may submit (was collaborator+). Reviewers still
--    read/update via the existing has_min_role('editor') policies.
DROP POLICY IF EXISTS "collab_insert"            ON public.song_suggestions;
DROP POLICY IF EXISTS "song_suggestions_insert"  ON public.song_suggestions;
CREATE POLICY "song_suggestions_insert" ON public.song_suggestions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND suggested_by = auth.uid());
