-- Down-migration for 20261106120000_song_stats_admin_views.sql.
--
-- Data-lossless: the schema holds only views and helper functions over the
-- Phase 1 tables, which are untouched. Applied by hand in the SQL editor.

DROP SCHEMA IF EXISTS song_stats_admin CASCADE;
