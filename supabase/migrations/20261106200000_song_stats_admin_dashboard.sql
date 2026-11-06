-- Setlist Stats — a read path for the admin dashboard page (/admin/stats).
--
-- Applied BY HAND in the Supabase SQL editor (never `db push`).
-- Down-migration: 20261106200000_song_stats_admin_dashboard.down.sql.
--
-- ── What this adds, in plain English ──────────────────────────────────────
-- One function, public.get_song_stats_admin(). A signed-in admin or owner
-- calls it from the website and gets back the song_stats_admin views as one
-- JSON object. Anyone else gets an error.
--
-- The views themselves stay closed: the song_stats_admin schema is still not
-- granted to anon or authenticated and not exposed through the API. This
-- function is the only door, and it opens only for has_min_role('admin').
-- It runs as its owner (SECURITY DEFINER), which is what lets it read the
-- closed schema.
--
-- Nothing new is computed here. Every number comes from the views as they
-- are, so their rules still hold: no user ids, catalog songs only, the owner
-- left out (20261106180000), and any figure from fewer than 5 people is NULL.
--
-- Long lists are capped so the response stays small: the top 50 songs by
-- plays and by opens, the last 12 weeks and 12 months. The never-sung lists
-- are complete; they can't be longer than the published library.
--
-- The SQL editor runs as postgres with no signed-in user, so this function
-- refuses it. Query the views directly there, as before.
--
-- ── Verification (read-only; run after applying) ──────────────────────────
--   -- SECURITY DEFINER, empty search_path. Expect: t | {search_path=""}
--   SELECT prosecdef, proconfig FROM pg_proc
--    WHERE oid = 'public.get_song_stats_admin()'::regprocedure;
--   -- Grants. Expect: anon f, authenticated t
--   SELECT r, has_function_privilege(r, 'public.get_song_stats_admin()', 'EXECUTE')
--     FROM unnest(ARRAY['anon','authenticated']) r;
--   -- Schema still closed. Expect: f, f
--   SELECT has_schema_privilege('anon', 'song_stats_admin', 'USAGE'),
--          has_schema_privilege('authenticated', 'song_stats_admin', 'USAGE');

DO $guard$
BEGIN
  IF to_regprocedure('song_stats_admin.is_counted(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261106120000_song_stats_admin_views.sql and 20261106180000_song_stats_exclude_owner.sql first.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_song_stats_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- has_min_role() is false with no session or no users row, so this fails closed.
  IF NOT coalesce(public.has_min_role('admin'), false) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'min_users', song_stats_admin.min_users(),
    'coverage', (SELECT to_jsonb(c) FROM song_stats_admin.library_coverage c),
    'most_sung', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.plays DESC NULLS LAST, v.title), '[]'::jsonb)
        FROM (SELECT * FROM song_stats_admin.song_leaderboard
               ORDER BY plays DESC NULLS LAST, title LIMIT 50) v),
    'most_opened', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.opens DESC NULLS LAST, v.title), '[]'::jsonb)
        FROM (SELECT * FROM song_stats_admin.open_leaderboard
               ORDER BY opens DESC NULLS LAST, title LIMIT 50) v),
    'never_sung', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('title', v.title, 'created_at', v.created_at)
                                ORDER BY v.title), '[]'::jsonb)
        FROM song_stats_admin.never_played v),
    'never_sung_or_opened', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('title', v.title, 'created_at', v.created_at)
                                ORDER BY v.title), '[]'::jsonb)
        FROM song_stats_admin.never_opened v),
    'weekly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('period_start', v.period_start,
                                                   'active_users', v.active_users, 'sets', v.sets)
                                ORDER BY v.period_start DESC), '[]'::jsonb)
        FROM (SELECT * FROM song_stats_admin.active_users WHERE period = 'week'
               ORDER BY period_start DESC LIMIT 12) v),
    'monthly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('period_start', v.period_start,
                                                   'active_users', v.active_users, 'sets', v.sets,
                                                   'mean_sets', s.mean_sets, 'median_sets', s.median_sets)
                                ORDER BY v.period_start DESC), '[]'::jsonb)
        FROM (SELECT * FROM song_stats_admin.active_users WHERE period = 'month'
               ORDER BY period_start DESC LIMIT 12) v
        LEFT JOIN song_stats_admin.sessions_per_active_user s ON s.month = v.period_start),
    'set_lengths', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.songs_per_set), '[]'::jsonb)
        FROM song_stats_admin.set_length_distribution v),
    'depth', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY substring(v.lifetime_sets FROM '^[0-9]+')::int), '[]'::jsonb)
        FROM song_stats_admin.depth_buckets v),
    'feature_totals', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.uses DESC, v.feature), '[]'::jsonb)
        FROM song_stats_admin.feature_totals v),
    'feature_monthly', (
      SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.month DESC, v.uses DESC), '[]'::jsonb)
        FROM song_stats_admin.feature_monthly v
       WHERE v.month >= (date_trunc('month', current_date) - interval '11 months')::date)
  );
END;
$function$;

REVOKE ALL    ON FUNCTION public.get_song_stats_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_song_stats_admin() TO authenticated, service_role;
