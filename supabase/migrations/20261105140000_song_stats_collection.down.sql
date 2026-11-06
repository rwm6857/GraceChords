-- =============================================================================
-- Revert 20261105140000_song_stats_collection.sql.
--
-- NOT data-lossless: drops every collected play, open and feature counter.
-- Schema-clean: removes exactly the three tables, their triggers and the three
-- functions that migration created; nothing else references them.
--
-- Clients keep working after the revert: song-stats writes go through an
-- offline outbox that drops a batch the server permanently rejects, so a
-- missing table costs the log, never an error on screen.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.record_feature_use(text, date, integer);
DROP FUNCTION IF EXISTS public.clear_my_song_stats();

DROP TABLE IF EXISTS public.feature_counters;
DROP TABLE IF EXISTS public.song_opens;   -- drops song_opens_purge_expired with it
DROP TABLE IF EXISTS public.song_plays;   -- drops song_plays_purge_expired with it

DROP FUNCTION IF EXISTS public.purge_expired_song_stats();

COMMIT;
