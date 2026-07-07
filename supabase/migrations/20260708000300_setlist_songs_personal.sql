-- =============================================================================
-- GraceChords: Allow personal songs in setlists (2026-07-08)
--
-- setlist_songs.song_id is a NOT NULL FK to public.songs, so personal drafts
-- can't be added. Add a parallel nullable personal_song_id FK and a
-- "exactly one of" check. Real FKs on both columns keep ON DELETE CASCADE
-- integrity (chosen over dropping the FK for a trigger).
-- =============================================================================

ALTER TABLE public.setlist_songs
  ADD COLUMN IF NOT EXISTS personal_song_id uuid REFERENCES public.personal_songs(id) ON DELETE CASCADE;

-- One of the two references must be set (public OR personal), never both/neither.
ALTER TABLE public.setlist_songs ALTER COLUMN song_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='setlist_songs_one_ref_chk'
                   AND conrelid='public.setlist_songs'::regclass) THEN
    ALTER TABLE public.setlist_songs
      ADD CONSTRAINT setlist_songs_one_ref_chk
      CHECK ((song_id IS NOT NULL) <> (personal_song_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS setlist_songs_personal_song_id_idx
  ON public.setlist_songs (personal_song_id);
