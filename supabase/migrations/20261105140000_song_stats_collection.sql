-- =============================================================================
-- GraceChords: Song Stats — Phase 1 collection tables (2026-11-05)
--
-- Three streams, three tables. Nothing in the app reads any of them yet; the
-- user-facing stats (Phase 2) and the admin views (Phase 3) come later, so this
-- migration deliberately grants NO admin read on the two per-user tables. Phase 3
-- adds aggregate, suppressed views as its own reviewable change.
--
--   song_plays        one row per song actually performed (performer mode on
--                     mobile, Worship Mode on web). Identified, append-only,
--                     denormalized so later song/setlist edits cannot rewrite it.
--   song_opens        one row per song kept on screen >= 15s in a song viewer,
--                     at most one per user, song and UTC hour. Identified.
--   feature_counters  one counter per feature per day. No user, device or
--                     session column at all — anonymous by construction.
--
-- RULES, IN PLAIN ENGLISH
--   song_plays / song_opens
--     * A signed-in user can INSERT rows only with their own user_id.
--     * A signed-in user can SELECT only their own rows.
--     * Nobody can UPDATE a row (no policy, no grant).
--     * Nobody can DELETE a row directly. The only delete paths are:
--         - clear_my_song_stats(): the caller's own rows, every one of them;
--         - account deletion: user_id → auth.users ON DELETE CASCADE;
--         - the 24-month retention purge, run by trigger on each insert.
--     * Signed-out (anon) callers get nothing: no grant at all.
--   feature_counters
--     * No client can INSERT/UPDATE/DELETE the table directly. Increments go
--       through record_feature_use(), which validates the feature name, the day
--       and the count.
--     * SELECT is denied to everyone except role admin/owner, via the same
--       has_min_role('admin') pattern as editor_audit_log.
--
-- HARD REQUIREMENTS (from the spec)
--   * No foreign key from song_plays to songs, personal_songs or setlists, so
--     deleting any of them can never delete history. Titles and tags are copied
--     onto the row at write time instead.
--   * No foreign key to sessions (Live Session): those rows are designed to be
--     deleted by workers/session-cleanup. live_session_id is a plain uuid.
--   * user_id cascades from auth.users, so account deletion (delete_user(),
--     admin_delete_user()) removes every row with no extra work.
--
-- DRIFT NOTE
--   Phase 0 (2026-11-05) compared live to this directory for every table this
--   migration touches or depends on: setlists, setlist_songs, sessions, users
--   and the role helpers match. song_plays, song_opens, feature_counters,
--   clear_my_song_stats and record_feature_use did not exist live. The guards
--   below re-check that before changing anything.
--
-- PREREQUISITE
--   20261105130000_update_user_role_require_admin.sql must be live first: the
--   counter read policy trusts users.role, which that migration makes
--   trustworthy. The first guard refuses to run without it.
--
-- Apply by hand in the Supabase SQL editor (see AGENTS.md — never db push).
-- Idempotent where it can be; the guards make a re-run on a half-applied
-- database fail loudly rather than drift.
-- Revert: 20261105140000_song_stats_collection.down.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guards: fail before changing anything.
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF to_regprocedure('public.has_min_role(text)') IS NULL THEN
    RAISE EXCEPTION 'song stats: public.has_min_role(text) is missing';
  END IF;
  IF pg_get_functiondef('public.update_user_role(uuid, text)'::regprocedure)
       NOT LIKE '%has_min_role(''admin'')%' THEN
    RAISE EXCEPTION 'song stats: apply 20261105130000_update_user_role_require_admin.sql first';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1. song_plays — the play log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.song_plays (
  -- Owner. Cascades so account deletion erases the log.
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- One performer-mode session (client-generated). NOT a Live Session id.
  performer_session_id uuid        NOT NULL,
  -- Position of the entry in the set (0 for a single song). With the two
  -- columns above it is the dedupe key the offline retry path relies on.
  entry_index          smallint    NOT NULL CHECK (entry_index BETWEEN 0 AND 499),
  -- songs.id or personal_songs.id. Deliberately no FK: history must survive deletes.
  song_id              uuid        NOT NULL,
  -- Which table song_id points into. 'personal' rows are private content and
  -- must be excluded from every cross-user aggregate.
  song_source          text        NOT NULL CHECK (song_source IN ('catalog', 'personal')),
  -- Title as it read at play time, so a deleted song still renders.
  song_title           text        NOT NULL CHECK (char_length(song_title) BETWEEN 1 AND 300),
  -- Tags as they read at play time (free text today; snapshot keeps them honest).
  song_tags            text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(song_tags) <= 30),
  -- The key actually displayed, transposition included. NULL if unknown.
  song_key             text        CHECK (char_length(song_key) <= 12),
  -- Setlist in use, if any. No FK: deleting a setlist must not erase plays.
  setlist_id           uuid,
  -- Live Session running at the time, if any. No FK (sessions rows are deleted).
  live_session_id      uuid,
  -- When this song was first displayed in the session.
  played_at            timestamptz NOT NULL,
  -- Device UTC offset at play time, so "Sunday" means the user's Sunday even if
  -- they later view their stats from another timezone.
  utc_offset_minutes   smallint    NOT NULL CHECK (utc_offset_minutes BETWEEN -840 AND 840),
  -- Server receipt time (offline rows can arrive days after played_at).
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, performer_session_id, entry_index),
  -- Offline rows may be old; rows from the future or older than the 24-month
  -- retention window are client bugs, not history.
  CONSTRAINT song_plays_played_at_sane
    CHECK (played_at <= created_at + interval '5 minutes'
       AND played_at >= created_at - interval '90 days')
);

-- "This user's rows in a date range" (Phase 2 fetch, newest first).
CREATE INDEX IF NOT EXISTS song_plays_user_played_idx
  ON public.song_plays (user_id, played_at DESC);
-- "All rows for a given song" (Phase 3 leaderboard / reach / never played).
CREATE INDEX IF NOT EXISTS song_plays_song_idx
  ON public.song_plays (song_id, played_at);
-- Retention purge and "active users by week" scan by time alone.
CREATE INDEX IF NOT EXISTS song_plays_played_at_idx
  ON public.song_plays (played_at);

ALTER TABLE public.song_plays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.song_plays FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.song_plays TO authenticated;
GRANT ALL ON public.song_plays TO service_role;

DROP POLICY IF EXISTS song_plays_select_own ON public.song_plays;
CREATE POLICY song_plays_select_own ON public.song_plays
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS song_plays_insert_own ON public.song_plays;
CREATE POLICY song_plays_insert_own ON public.song_plays
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. song_opens — song-viewer opens (>= 15s on screen, one per user/song/hour)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.song_opens (
  -- Owner. Cascades so account deletion erases it.
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- songs.id or personal_songs.id. No FK, same reason as song_plays.
  song_id      uuid        NOT NULL,
  -- Lets admin aggregates exclude private personal songs.
  song_source  text        NOT NULL CHECK (song_source IN ('catalog', 'personal')),
  -- When the open started (client clock; queued offline).
  opened_at    timestamptz NOT NULL,
  -- UTC hour bucket: the server-side half of the one-per-hour debounce.
  -- timezone(text, timestamptz) and date_trunc(text, timestamp) are IMMUTABLE.
  opened_hour  timestamp   GENERATED ALWAYS AS (date_trunc('hour', timezone('UTC', opened_at))) STORED,
  -- Server receipt time.
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id, opened_hour),
  CONSTRAINT song_opens_opened_at_sane
    CHECK (opened_at <= created_at + interval '5 minutes'
       AND opened_at >= created_at - interval '90 days')
);

-- "This user's opens in a date range" (Phase 2 Most opened).
CREATE INDEX IF NOT EXISTS song_opens_user_opened_idx
  ON public.song_opens (user_id, opened_at DESC);
-- "All opens for a given song" (Phase 3 open leaderboard / never opened).
CREATE INDEX IF NOT EXISTS song_opens_song_idx
  ON public.song_opens (song_id, opened_at);
-- Retention purge.
CREATE INDEX IF NOT EXISTS song_opens_opened_at_idx
  ON public.song_opens (opened_at);

ALTER TABLE public.song_opens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.song_opens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.song_opens TO authenticated;
GRANT ALL ON public.song_opens TO service_role;

DROP POLICY IF EXISTS song_opens_select_own ON public.song_opens;
CREATE POLICY song_opens_select_own ON public.song_opens
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS song_opens_insert_own ON public.song_opens;
CREATE POLICY song_opens_insert_own ON public.song_opens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Retention: 24 months, purged on write (the client_errors pattern) rather
--    than by a scheduled job. Runs once per INSERT statement, not per row, and
--    is an index range scan on *_at_idx. SECURITY DEFINER so it can delete
--    other users' expired rows; it touches nothing younger than 24 months.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_song_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'song_plays' THEN
    DELETE FROM public.song_plays WHERE played_at < now() - interval '24 months';
  ELSIF TG_TABLE_NAME = 'song_opens' THEN
    DELETE FROM public.song_opens WHERE opened_at < now() - interval '24 months';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_song_stats() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS song_plays_purge_expired ON public.song_plays;
CREATE TRIGGER song_plays_purge_expired
  AFTER INSERT ON public.song_plays
  FOR EACH STATEMENT EXECUTE FUNCTION public.purge_expired_song_stats();

DROP TRIGGER IF EXISTS song_opens_purge_expired ON public.song_opens;
CREATE TRIGGER song_opens_purge_expired
  AFTER INSERT ON public.song_opens
  FOR EACH STATEMENT EXECUTE FUNCTION public.purge_expired_song_stats();

-- ---------------------------------------------------------------------------
-- 4. clear_my_song_stats() — "Clear my history". The one permitted exception
--    to append-only: hard-deletes every play and open row for the CALLER only.
--    There is no parameter, so it cannot be pointed at anyone else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_my_song_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  caller uuid := auth.uid();
  plays  integer;
  opens  integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.song_plays WHERE user_id = caller;
  GET DIAGNOSTICS plays = ROW_COUNT;
  DELETE FROM public.song_opens WHERE user_id = caller;
  GET DIAGNOSTICS opens = ROW_COUNT;
  RETURN jsonb_build_object('plays', plays, 'opens', opens);
END;
$function$;

REVOKE ALL    ON FUNCTION public.clear_my_song_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_song_stats() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. feature_counters — anonymous per-feature daily counters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_counters (
  -- Fixed vocabulary; a new feature is a reviewed migration, not a client string.
  feature  text    NOT NULL CHECK (feature IN (
             'tuner', 'metronome', 'pitch_pipe', 'key_reference', 'capo',
             'performer_mode', 'pdf_export', 'image_export', 'daily_word',
             'telegram_link')),
  -- The device's local calendar day the opens happened on.
  day      date    NOT NULL,
  -- Opens that day. bigint: anonymous counters are kept indefinitely.
  count    bigint  NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (feature, day)
);

ALTER TABLE public.feature_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_counters FROM PUBLIC, anon, authenticated;
-- SELECT is granted only so the admin policy below can apply; for any other
-- role the policy returns zero rows.
GRANT SELECT ON public.feature_counters TO authenticated;
GRANT ALL ON public.feature_counters TO service_role;

-- Admin read, separately reviewable: admin and owner only.
DROP POLICY IF EXISTS feature_counters_admin_read ON public.feature_counters;
CREATE POLICY feature_counters_admin_read ON public.feature_counters
  FOR SELECT TO authenticated
  USING (public.has_min_role('admin'));

-- Increments go through this function, never a client upsert: an
-- INSERT … ON CONFLICT DO UPDATE must pass the SELECT policy for the existing
-- row, which non-admins deliberately cannot. It records nothing about the
-- caller. Clients batch opens locally and send them as one count.
CREATE OR REPLACE FUNCTION public.record_feature_use(p_feature text, p_day date, p_count integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 100 THEN
    RAISE EXCEPTION 'Invalid count';
  END IF;
  -- Device-local days run up to 14h either side of UTC; queued offline
  -- counts may be a few days old.
  IF p_day IS NULL OR p_day > current_date + 1 OR p_day < current_date - 14 THEN
    RAISE EXCEPTION 'Invalid day';
  END IF;
  -- The CHECK constraint rejects an unknown feature name.
  INSERT INTO public.feature_counters AS fc (feature, day, count)
  VALUES (p_feature, p_day, p_count)
  ON CONFLICT (feature, day) DO UPDATE SET count = fc.count + EXCLUDED.count;
END;
$function$;

REVOKE ALL    ON FUNCTION public.record_feature_use(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_feature_use(text, date, integer) TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- VERIFY (read-only; run after applying)
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('song_plays','song_opens','feature_counters');      -- 3 rows, all true
--   SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
--    WHERE tablename IN ('song_plays','song_opens','feature_counters');    -- 5 rows, no UPDATE/DELETE
--   SELECT grantee, table_name, string_agg(privilege_type, ',')
--     FROM information_schema.role_table_grants
--    WHERE table_name IN ('song_plays','song_opens','feature_counters')
--      AND grantee IN ('anon','authenticated') GROUP BY 1,2;              -- anon: none
--   SELECT proname, proacl FROM pg_proc
--    WHERE proname IN ('clear_my_song_stats','record_feature_use','purge_expired_song_stats');
--
-- Then, signed in as an ordinary user (not in the SQL editor, which is postgres):
--   insert a song_plays row with another user's id                → RLS error
--   update or delete your own song_plays row                      → permission denied
--   select from feature_counters                                  → 0 rows
--   select record_feature_use('tuner', current_date, 1)           → ok
--   select record_feature_use('made_up', current_date, 1)         → check violation
-- =============================================================================
