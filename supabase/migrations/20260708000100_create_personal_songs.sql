-- =============================================================================
-- GraceChords: personal_songs table (2026-07-08)
--
-- Private, owner-scoped song drafts. Any authenticated user may create them.
-- They stay invisible to everyone but the owner (RLS below); reviewers only
-- ever see a draft's content through the song_suggestions.payload snapshot,
-- never this table directly. Approving an 'addition'/'edit' suggestion
-- publishes into public.songs and flips the draft to 'published' (see the
-- review_song_suggestion RPC migration).
--
-- Columns mirror the authoring-relevant subset of the live songs table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.personal_songs (
  id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id          uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  artist            text,
  default_key       text,
  tempo             integer,
  time_signature    text,
  chordpro_content  text        NOT NULL DEFAULT '',
  tags              text[]      NOT NULL DEFAULT '{}',
  country           text,
  youtube_id        text,
  language          text,
  pptx_url          text,
  mp3_url           text,
  slug              text,
  status            text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','submitted','published','archived')),
  source_song_id    uuid        REFERENCES public.songs(id) ON DELETE SET NULL,   -- fork provenance
  published_song_id uuid        REFERENCES public.songs(id) ON DELETE SET NULL,   -- set once published
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);

CREATE INDEX IF NOT EXISTS personal_songs_owner_id_idx ON public.personal_songs (owner_id);
CREATE INDEX IF NOT EXISTS personal_songs_status_idx   ON public.personal_songs (status);

DROP TRIGGER IF EXISTS trg_personal_songs_updated_at ON public.personal_songs;
CREATE TRIGGER trg_personal_songs_updated_at
  BEFORE UPDATE ON public.personal_songs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.personal_songs ENABLE ROW LEVEL SECURITY;

-- Owner-only, all commands. No editor/admin read — privacy isolation is the
-- whole point of a separate table.
DROP POLICY IF EXISTS "personal_songs_select" ON public.personal_songs;
DROP POLICY IF EXISTS "personal_songs_insert" ON public.personal_songs;
DROP POLICY IF EXISTS "personal_songs_update" ON public.personal_songs;
DROP POLICY IF EXISTS "personal_songs_delete" ON public.personal_songs;

CREATE POLICY "personal_songs_select" ON public.personal_songs
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "personal_songs_insert" ON public.personal_songs
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "personal_songs_update" ON public.personal_songs
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "personal_songs_delete" ON public.personal_songs
  FOR DELETE USING (owner_id = auth.uid());
