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
-- verse_ref}". Assumes the personal-songs migration (20260708000300) is already
-- applied, per the repo's ordered forward-only convention.
--
-- Forward-only + idempotent. Rollback block at the bottom.
-- =============================================================================

ALTER TABLE public.setlist_songs ADD COLUMN IF NOT EXISTS verse_ref text;

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
