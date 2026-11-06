-- Song Stats — leave the owner's own use out of the admin numbers.
--
-- Applied BY HAND in the Supabase SQL editor (never `db push`).
-- Down-migration: 20261106180000_song_stats_exclude_owner.down.sql.
-- No app release needed: everything here is server-side.
--
-- ── What changes, in plain English ────────────────────────────────────────
-- 1. Admin views (song_stats_admin.*) skip every play and open made by an
--    account whose role is 'owner'. The rows are still stored, so the owner's
--    own Setlist Stats in the app are unchanged; they simply don't appear in
--    the totals the owner reads. The rule lives in ONE function,
--    song_stats_admin.is_counted(), and every view below reads plays and
--    opens through it. Suppression (fewer than 5 users → NULL) now counts only
--    the users who are counted.
-- 2. record_feature_use() quietly ignores calls from an owner account. Feature
--    counters have no user column, so this is the only point where an owner's
--    use can be told apart; counts already recorded can't be separated after
--    the fact. The call still succeeds, so the app's offline queue clears as
--    normal.
--
-- The views below are 20261106120000_song_stats_admin_views.sql with the
-- is_counted() filter added; columns and order are unchanged, so CREATE OR
-- REPLACE is enough. The feature-counter views read only feature_counters and
-- are untouched.
--
-- ── Verification (read-only; run after applying) ──────────────────────────
--   SELECT song_stats_admin.is_counted(id) AS counted, role
--     FROM public.users WHERE role = 'owner';            -- expect: false, owner
--   SELECT prosrc LIKE '%owner%' AS skips_owner
--     FROM pg_proc WHERE proname = 'record_feature_use'; -- expect: true

DO $guard$
BEGIN
  IF to_regnamespace('song_stats_admin') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261106120000_song_stats_admin_views.sql first: song_stats_admin is missing.';
  END IF;
END
$guard$;

-- True when this user's plays and opens belong in the admin totals.
-- The owner is left out so their own testing and use don't skew the numbers.
CREATE OR REPLACE FUNCTION song_stats_admin.is_counted(uid uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = uid AND u.role = 'owner')
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
     AND song_stats_admin.is_counted(user_id)
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
     AND song_stats_admin.is_counted(user_id)
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
                    WHERE p.song_source = 'catalog' AND p.song_id = s.id
                      AND song_stats_admin.is_counted(p.user_id))
 ORDER BY s.title;

-- Never sung AND never opened: true dead weight.
CREATE OR REPLACE VIEW song_stats_admin.never_opened AS
SELECT s.id AS song_id, s.title, s.created_at
  FROM public.songs s
 WHERE s.is_deleted = false AND s.status = 'published'
   AND NOT EXISTS (SELECT 1 FROM public.song_plays p
                    WHERE p.song_source = 'catalog' AND p.song_id = s.id
                      AND song_stats_admin.is_counted(p.user_id))
   AND NOT EXISTS (SELECT 1 FROM public.song_opens o
                    WHERE o.song_source = 'catalog' AND o.song_id = s.id
                      AND song_stats_admin.is_counted(o.user_id))
 ORDER BY s.title;

-- One row: how much of the library got used in the last 90 days.
CREATE OR REPLACE VIEW song_stats_admin.library_coverage AS
WITH lib AS (
  SELECT id FROM public.songs WHERE is_deleted = false AND status = 'published'
),
recent_plays AS (
  SELECT song_id, user_id FROM public.song_plays
   WHERE song_source = 'catalog' AND played_at >= now() - interval '90 days'
     AND song_stats_admin.is_counted(user_id)
),
recent_opens AS (
  SELECT song_id, user_id FROM public.song_opens
   WHERE song_source = 'catalog' AND opened_at >= now() - interval '90 days'
     AND song_stats_admin.is_counted(user_id)
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
     AND song_stats_admin.is_counted(user_id)
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
     AND song_stats_admin.is_counted(user_id)
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
     AND song_stats_admin.is_counted(user_id)
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
     AND song_stats_admin.is_counted(user_id)
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

-- ── Feature counters: don't count the owner ───────────────────────────────

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
  -- The owner's own use is left out of the anonymous totals. Return normally
  -- so the app treats the call as sent and clears it from its queue.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner') THEN
    RETURN;
  END IF;
  -- The CHECK constraint rejects an unknown feature name.
  INSERT INTO public.feature_counters AS fc (feature, day, count)
  VALUES (p_feature, p_day, p_count)
  ON CONFLICT (feature, day) DO UPDATE SET count = fc.count + EXCLUDED.count;
END;
$function$;

REVOKE ALL    ON FUNCTION public.record_feature_use(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_feature_use(text, date, integer) TO authenticated, service_role;

-- Keep the admin schema closed to the API roles (covers the new function).
REVOKE ALL ON ALL TABLES IN SCHEMA song_stats_admin FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA song_stats_admin FROM PUBLIC, anon, authenticated;
