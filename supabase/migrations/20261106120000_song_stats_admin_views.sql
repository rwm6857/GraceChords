-- Song Stats — Phase 3: admin aggregate views (read in the Supabase SQL editor).
--
-- Proposed separately from any feature work and applied BY HAND in the
-- Supabase SQL editor (never `db push`). Down-migration:
-- 20261106120000_song_stats_admin_views.down.sql.
--
-- Spec: "Ship the views first and check them in the SQL editor for a few
-- weeks. Build dashboard tiles only for the questions you actually find
-- yourself re-running." This migration is only the views. No dashboard and
-- no API.
--
-- ── Who can read these, in plain English ──────────────────────────────────
-- The views live in their own schema, song_stats_admin, which is NOT exposed
-- through the API: anon and authenticated get no USAGE on it, and the schema
-- is not in PostgREST's exposed list. In practice only the SQL editor (the
-- postgres role) can query them. A future dashboard tile must wrap ONE view
-- in a SECURITY DEFINER function that checks has_min_role('admin'), and get
-- reviewed separately. Do not grant this schema to authenticated.
--
-- ── Rules every view follows ──────────────────────────────────────────────
-- 1. Aggregate only. No view returns a user id, an email, a name, or anything
--    that takes a user id as input. Users are counted inside the query, and
--    only counts leave it.
-- 2. Suppression: any figure derived from fewer than 5 distinct users is NULL
--    (shown as a dash). Enforced here, in the query, through
--    song_stats_admin.suppress(); the threshold is song_stats_admin.min_users().
-- 3. Personal songs are excluded from every view: song_source = 'catalog'
--    only. A personal song is private content; counting it across users is
--    meaningless and intrusive. A set made only of personal songs therefore
--    does not count toward the usage views either.
-- 4. Weeks and months are bucketed by the DEVICE-LOCAL time the set was sung
--    (played_at shifted by utc_offset_minutes), so a Sunday-evening service
--    is a Sunday. Song opens have no captured offset and are not bucketed.
-- 5. "Library" means songs a visitor can see: is_deleted = false AND
--    status = 'published' (the songs_select policy for non-editors).
-- 6. Play and open rows are kept 24 months (purge trigger, Phase 1), so
--    "lifetime" here means "the last 24 months". Feature counters are kept
--    indefinitely.
--
-- Live Session adoption metrics are NOT here. They are blocked on the Live
-- Session thread (no origin, ended_at, participants or heartbeat fields).
--
-- ── Views ─────────────────────────────────────────────────────────────────
--   song_leaderboard          plays, sets and reach per catalog song
--   open_leaderboard          song-viewer opens and reach per catalog song
--   never_played              library songs with zero plays
--   never_opened              library songs with zero plays AND zero opens
--   library_coverage          share of the library sung / sung-or-opened in 90 days
--   active_users              distinct users with a set, per local week and month
--   sessions_per_active_user  mean and median sets per active user, per month
--   set_length_distribution   histogram of catalog songs per set
--   depth_buckets             users by lifetime set count: 1, 2–5, 6–20, 21+
--   feature_daily / feature_monthly / feature_totals
--                             anonymous feature counters (mobile-weighted:
--                             tuner, metronome, pitch pipe, key reference and
--                             capo exist only on mobile)
--
-- ── Verification (read-only; run after applying) ──────────────────────────
--   -- Nothing is reachable from the API roles:
--   SELECT has_schema_privilege('anon', 'song_stats_admin', 'USAGE') AS anon_usage,
--          has_schema_privilege('authenticated', 'song_stats_admin', 'USAGE') AS auth_usage;
--   -- expect: false, false
--
--   -- No view exposes a user id column:
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE table_schema = 'song_stats_admin' AND column_name LIKE '%user_id%';
--   -- expect: 0 rows
--
--   SELECT * FROM song_stats_admin.song_leaderboard LIMIT 25;
--   SELECT * FROM song_stats_admin.library_coverage;
--   SELECT * FROM song_stats_admin.active_users ORDER BY period, period_start DESC LIMIT 20;
--   SELECT * FROM song_stats_admin.feature_totals;

DO $guard$
BEGIN
  IF to_regclass('public.song_plays') IS NULL
     OR to_regclass('public.song_opens') IS NULL
     OR to_regclass('public.feature_counters') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261105140000_song_stats_collection.sql first: the Song Stats tables are missing.';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS song_stats_admin;
COMMENT ON SCHEMA song_stats_admin IS
  'Song Stats aggregate views for the SQL editor. Not exposed to the API. Aggregate only: no user ids; figures from fewer than min_users() users are NULL; personal songs excluded.';

-- ── Suppression ───────────────────────────────────────────────────────────

-- The one place the threshold lives.
CREATE OR REPLACE FUNCTION song_stats_admin.min_users()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;

-- `value` when it was derived from at least min_users() distinct users, else NULL.
CREATE OR REPLACE FUNCTION song_stats_admin.suppress(value bigint, users bigint)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN users >= song_stats_admin.min_users() THEN value END
$$;

CREATE OR REPLACE FUNCTION song_stats_admin.suppress(value numeric, users bigint)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN users >= song_stats_admin.min_users() THEN value END
$$;

CREATE OR REPLACE FUNCTION song_stats_admin.suppress(value timestamptz, users bigint)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN users >= song_stats_admin.min_users() THEN value END
$$;

-- ── Library and repertoire ────────────────────────────────────────────────

-- Total plays per catalog song across all users, ranked. Suppressed rows
-- (under 5 singers) keep their title, so you can see a song is being sung,
-- but carry no numbers and no rank.
CREATE OR REPLACE VIEW song_stats_admin.song_leaderboard AS
WITH agg AS (
  SELECT song_id,
         count(*)                              AS plays,
         count(DISTINCT performer_session_id)  AS sets,
         count(DISTINCT user_id)               AS users,
         max(played_at)                        AS last_played,
         (array_agg(song_title ORDER BY played_at DESC))[1] AS snapshot_title
    FROM public.song_plays
   WHERE song_source = 'catalog'
   GROUP BY song_id
)
SELECT CASE WHEN a.users >= song_stats_admin.min_users()
            THEN rank() OVER (ORDER BY song_stats_admin.suppress(a.plays, a.users) DESC NULLS LAST) END AS rank,
       a.song_id,
       coalesce(s.title, a.snapshot_title)            AS title,
       (s.id IS NULL OR s.is_deleted)                 AS removed_from_library,
       song_stats_admin.suppress(a.plays, a.users)    AS plays,
       song_stats_admin.suppress(a.sets, a.users)     AS sets,
       song_stats_admin.suppress(a.users, a.users)    AS reach,
       song_stats_admin.suppress(a.last_played, a.users) AS last_played
  FROM agg a
  LEFT JOIN public.songs s ON s.id = a.song_id
 ORDER BY song_stats_admin.suppress(a.plays, a.users) DESC NULLS LAST, title;

-- Song-viewer opens per catalog song. A separate list from plays, on purpose:
-- "most opened" and "most sung" are different questions.
CREATE OR REPLACE VIEW song_stats_admin.open_leaderboard AS
WITH agg AS (
  SELECT song_id,
         count(*)                AS opens,
         count(DISTINCT user_id) AS users,
         max(opened_at)          AS last_opened
    FROM public.song_opens
   WHERE song_source = 'catalog'
   GROUP BY song_id
)
SELECT CASE WHEN a.users >= song_stats_admin.min_users()
            THEN rank() OVER (ORDER BY song_stats_admin.suppress(a.opens, a.users) DESC NULLS LAST) END AS rank,
       a.song_id,
       s.title,
       (s.id IS NULL OR s.is_deleted)                 AS removed_from_library,
       song_stats_admin.suppress(a.opens, a.users)    AS opens,
       song_stats_admin.suppress(a.users, a.users)    AS reach,
       song_stats_admin.suppress(a.last_opened, a.users) AS last_opened
  FROM agg a
  LEFT JOIN public.songs s ON s.id = a.song_id
 ORDER BY song_stats_admin.suppress(a.opens, a.users) DESC NULLS LAST, s.title;

-- Library songs nobody has sung (in the retained 24 months). Library facts,
-- not user figures, so nothing to suppress.
CREATE OR REPLACE VIEW song_stats_admin.never_played AS
SELECT s.id AS song_id, s.title, s.created_at
  FROM public.songs s
 WHERE s.is_deleted = false AND s.status = 'published'
   AND NOT EXISTS (SELECT 1 FROM public.song_plays p
                    WHERE p.song_source = 'catalog' AND p.song_id = s.id)
 ORDER BY s.title;

-- Never sung AND never opened: true dead weight.
CREATE OR REPLACE VIEW song_stats_admin.never_opened AS
SELECT s.id AS song_id, s.title, s.created_at
  FROM public.songs s
 WHERE s.is_deleted = false AND s.status = 'published'
   AND NOT EXISTS (SELECT 1 FROM public.song_plays p
                    WHERE p.song_source = 'catalog' AND p.song_id = s.id)
   AND NOT EXISTS (SELECT 1 FROM public.song_opens o
                    WHERE o.song_source = 'catalog' AND o.song_id = s.id)
 ORDER BY s.title;

-- One row: how much of the library got used in the last 90 days.
CREATE OR REPLACE VIEW song_stats_admin.library_coverage AS
WITH lib AS (
  SELECT id FROM public.songs WHERE is_deleted = false AND status = 'published'
),
recent_plays AS (
  SELECT song_id, user_id FROM public.song_plays
   WHERE song_source = 'catalog' AND played_at >= now() - interval '90 days'
),
recent_opens AS (
  SELECT song_id, user_id FROM public.song_opens
   WHERE song_source = 'catalog' AND opened_at >= now() - interval '90 days'
),
n AS (
  SELECT (SELECT count(*) FROM lib) AS library_songs,
         (SELECT count(*) FROM lib WHERE id IN (SELECT song_id FROM recent_plays)) AS sung,
         (SELECT count(*) FROM lib WHERE id IN (SELECT song_id FROM recent_plays
                                                UNION SELECT song_id FROM recent_opens)) AS sung_or_opened,
         (SELECT count(DISTINCT user_id) FROM recent_plays) AS singers,
         (SELECT count(DISTINCT user_id) FROM (SELECT user_id FROM recent_plays
                                               UNION SELECT user_id FROM recent_opens) u) AS users
)
SELECT library_songs,
       song_stats_admin.suppress(sung, singers) AS sung_90d,
       song_stats_admin.suppress(round(100.0 * sung / nullif(library_songs, 0), 1), singers) AS sung_90d_pct,
       song_stats_admin.suppress(sung_or_opened, users) AS sung_or_opened_90d,
       song_stats_admin.suppress(round(100.0 * sung_or_opened / nullif(library_songs, 0), 1), users) AS sung_or_opened_90d_pct
  FROM n;

-- ── Usage and engagement ──────────────────────────────────────────────────

-- Distinct users who ran at least one set, per local week (Monday start)
-- and per local month.
CREATE OR REPLACE VIEW song_stats_admin.active_users AS
WITH sets AS (
  SELECT user_id,
         performer_session_id,
         min((played_at AT TIME ZONE 'UTC') + make_interval(mins => utc_offset_minutes)) AS local_start
    FROM public.song_plays
   WHERE song_source = 'catalog'
   GROUP BY user_id, performer_session_id
)
SELECT 'week'::text AS period,
       date_trunc('week', local_start)::date AS period_start,
       song_stats_admin.suppress(count(DISTINCT user_id), count(DISTINCT user_id)) AS active_users,
       song_stats_admin.suppress(count(*), count(DISTINCT user_id)) AS sets
  FROM sets GROUP BY 2
UNION ALL
SELECT 'month', date_trunc('month', local_start)::date,
       song_stats_admin.suppress(count(DISTINCT user_id), count(DISTINCT user_id)),
       song_stats_admin.suppress(count(*), count(DISTINCT user_id))
  FROM sets GROUP BY 2
 ORDER BY 1, 2 DESC;

-- Sets per active user, per local month: mean and median.
CREATE OR REPLACE VIEW song_stats_admin.sessions_per_active_user AS
WITH sets AS (
  SELECT user_id,
         performer_session_id,
         min((played_at AT TIME ZONE 'UTC') + make_interval(mins => utc_offset_minutes)) AS local_start
    FROM public.song_plays
   WHERE song_source = 'catalog'
   GROUP BY user_id, performer_session_id
),
per_user AS (
  SELECT date_trunc('month', local_start)::date AS month, user_id, count(*) AS sets
    FROM sets GROUP BY 1, 2
)
SELECT month,
       song_stats_admin.suppress(count(*), count(*)) AS active_users,
       song_stats_admin.suppress(round(avg(sets), 2), count(*)) AS mean_sets,
       song_stats_admin.suppress(
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY sets))::numeric, 1), count(*)) AS median_sets
  FROM per_user
 GROUP BY month
 ORDER BY month DESC;

-- How many catalog songs a set has. Each bucket is suppressed on its own.
CREATE OR REPLACE VIEW song_stats_admin.set_length_distribution AS
WITH sets AS (
  SELECT user_id, performer_session_id, count(*) AS songs
    FROM public.song_plays
   WHERE song_source = 'catalog'
   GROUP BY user_id, performer_session_id
)
SELECT songs AS songs_per_set,
       song_stats_admin.suppress(count(*), count(DISTINCT user_id)) AS sets,
       song_stats_admin.suppress(count(DISTINCT user_id), count(DISTINCT user_id)) AS users
  FROM sets
 GROUP BY songs
 ORDER BY songs;

-- Users grouped by how many sets they have run in the retained window. The
-- closest honest proxy for retention. Every bucket is listed, empty or not.
CREATE OR REPLACE VIEW song_stats_admin.depth_buckets AS
WITH per_user AS (
  SELECT user_id, count(DISTINCT performer_session_id) AS sets
    FROM public.song_plays
   WHERE song_source = 'catalog'
   GROUP BY user_id
),
buckets(ord, label, lo, hi) AS (
  VALUES (1, '1', 1, 1), (2, '2–5', 2, 5), (3, '6–20', 6, 20), (4, '21+', 21, NULL)
)
SELECT b.label AS lifetime_sets,
       song_stats_admin.suppress(count(p.user_id), count(p.user_id)) AS users
  FROM buckets b
  LEFT JOIN per_user p ON p.sets >= b.lo AND (b.hi IS NULL OR p.sets <= b.hi)
 GROUP BY b.ord, b.label
 ORDER BY b.ord;

-- ── Feature counters (anonymous; no suppression needed — no users in them) ─

CREATE OR REPLACE VIEW song_stats_admin.feature_daily AS
SELECT feature, day, count AS uses
  FROM public.feature_counters
 ORDER BY day DESC, feature;

CREATE OR REPLACE VIEW song_stats_admin.feature_monthly AS
SELECT feature, date_trunc('month', day)::date AS month, sum(count)::bigint AS uses
  FROM public.feature_counters
 GROUP BY 1, 2
 ORDER BY month DESC, uses DESC;

CREATE OR REPLACE VIEW song_stats_admin.feature_totals AS
SELECT feature, sum(count)::bigint AS uses, min(day) AS first_day, max(day) AS last_day
  FROM public.feature_counters
 GROUP BY feature
 ORDER BY uses DESC;

COMMENT ON VIEW song_stats_admin.feature_totals IS
  'Mobile-weighted: tuner, metronome, pitch_pipe, key_reference and capo exist only on mobile. Not a platform comparison.';

-- ── Lock it down ──────────────────────────────────────────────────────────
-- Belt and braces: nothing in this schema is reachable by the API roles,
-- whatever default privileges the project has.
REVOKE ALL ON SCHEMA song_stats_admin FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA song_stats_admin FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA song_stats_admin FROM PUBLIC, anon, authenticated;
