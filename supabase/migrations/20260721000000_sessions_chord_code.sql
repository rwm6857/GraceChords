-- =============================================================================
-- GraceChords: live Sessions — chord/lyric split (Phase 3A, 2026-07-21)
--
-- A session gets a SECOND fresh code so the leader can share two links for the
-- same session: `code` (the existing column) is the LYRIC tier, `chord_code` is
-- the TEAM/chord tier. The follower's content tier is decided by which code it
-- joined with — ONE session row remains the single source of truth (both tiers
-- ride the same Realtime channel, keyed by id). Chords are UX layering, not a
-- security boundary, so RLS is unchanged (SELECT is already `USING (true)`).
--
-- Backward-compatible: existing `/s/{code}` links stay lyric-tier; pre-existing
-- rows keep chord_code NULL (a UNIQUE index allows many NULLs in Postgres).
--
-- Forward-only + idempotent, per repo convention. Rollback block at the bottom.
-- =============================================================================

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS chord_code text;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_chord_code_idx ON public.sessions (chord_code);


-- =============================================================================
-- DOWN MIGRATION (rollback) — run manually to reverse this migration.
--
--   DROP INDEX IF EXISTS public.sessions_chord_code_idx;
--   ALTER TABLE public.sessions DROP COLUMN IF EXISTS chord_code;
-- =============================================================================
