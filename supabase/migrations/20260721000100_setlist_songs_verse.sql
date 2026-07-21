-- =============================================================================
-- GraceChords: Bible verses as first-class setlist items (Phase 3B, 2026-07-21)
--
-- A setlist item can now be a Bible verse in addition to a public song or a
-- personal song. The verse is stored as its canonical `v:<translation>|<Book>
-- <ref>` id (translation embedded) in a new `verse_ref` column — the same opaque
-- id the app's verseRef/setcode/session-snapshot code already speaks.
--
-- The existing two-way "exactly one of song_id / personal_song_id" CHECK is
-- rewritten to a three-way "exactly one of {song_id, personal_song_id,
-- verse_ref}".
--
-- The personal-songs migration (20260708000300) normally runs first and adds
-- the `personal_song_id` column, makes `song_id` nullable, and indexes it. But
-- databases in the wild have hit "column personal_song_id does not exist" here
-- when that earlier migration was not applied. Rather than hard-depend on it,
-- this migration re-asserts that setup idempotently below, so it succeeds
-- regardless of the prior migration's state.
--
-- Forward-only + idempotent. Rollback block at the bottom.
-- =============================================================================

ALTER TABLE public.setlist_songs ADD COLUMN IF NOT EXISTS verse_ref text;

-- Re-assert the personal-songs setup (mirrors 20260708000300) so this migration
-- is self-contained. Each statement is a no-op if that migration already ran.
--
-- The column is added with a plain top-level statement first, guaranteeing it
-- exists before the index and CHECK below reference it. The foreign key to
-- public.personal_songs is then attached separately, guarded so it is skipped
-- when that table is absent or the FK is already present.
ALTER TABLE public.setlist_songs ADD COLUMN IF NOT EXISTS personal_song_id uuid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'personal_songs')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'setlist_songs_personal_song_id_fkey'
               AND conrelid = 'public.setlist_songs'::regclass) THEN
    ALTER TABLE public.setlist_songs
      ADD CONSTRAINT setlist_songs_personal_song_id_fkey
      FOREIGN KEY (personal_song_id) REFERENCES public.personal_songs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.setlist_songs ALTER COLUMN song_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS setlist_songs_personal_song_id_idx
  ON public.setlist_songs (personal_song_id);

ALTER TABLE public.setlist_songs DROP CONSTRAINT IF EXISTS setlist_songs_one_ref_chk;
ALTER TABLE public.setlist_songs
  ADD CONSTRAINT setlist_songs_one_ref_chk CHECK (
    (song_id IS NOT NULL)::int
    + (personal_song_id IS NOT NULL)::int
    + (verse_ref IS NOT NULL)::int
    = 1
  );


-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
-- NOTE: delete any verse rows first, or the two-way CHECK re-add will fail.
--
--   -- DELETE FROM public.setlist_songs WHERE verse_ref IS NOT NULL;
--   ALTER TABLE public.setlist_songs DROP CONSTRAINT IF EXISTS setlist_songs_one_ref_chk;
--   ALTER TABLE public.setlist_songs
--     ADD CONSTRAINT setlist_songs_one_ref_chk
--     CHECK ((song_id IS NOT NULL) <> (personal_song_id IS NOT NULL));
--   ALTER TABLE public.setlist_songs DROP COLUMN IF EXISTS verse_ref;
-- =============================================================================
