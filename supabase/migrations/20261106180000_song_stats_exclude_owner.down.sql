-- Down-migration for 20261106180000_song_stats_exclude_owner.sql.
--
-- Data-lossless. Puts the owner back into the admin totals and counters:
-- is_counted() counts everyone again (the views keep calling it, so their
-- definitions don't need replaying), and record_feature_use() goes back to
-- counting every signed-in caller. Owner feature uses skipped while the
-- up-migration was live are not recovered: they were never stored.
-- Applied by hand in the SQL editor.

CREATE OR REPLACE FUNCTION song_stats_admin.is_counted(uid uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

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
  IF p_day IS NULL OR p_day > current_date + 1 OR p_day < current_date - 14 THEN
    RAISE EXCEPTION 'Invalid day';
  END IF;
  INSERT INTO public.feature_counters AS fc (feature, day, count)
  VALUES (p_feature, p_day, p_count)
  ON CONFLICT (feature, day) DO UPDATE SET count = fc.count + EXCLUDED.count;
END;
$function$;

REVOKE ALL    ON FUNCTION public.record_feature_use(text, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_feature_use(text, date, integer) TO authenticated, service_role;
