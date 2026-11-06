-- Down-migration for 20261106200000_song_stats_admin_dashboard.sql.
--
-- Data-lossless: drops only the read function. The views and the Song Stats
-- tables are untouched. The /admin/stats page then shows its "not set up"
-- message. Applied by hand in the SQL editor.

DROP FUNCTION IF EXISTS public.get_song_stats_admin();
