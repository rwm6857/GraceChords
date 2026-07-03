-- =============================================================================
-- GraceChords: Add created_at to user_starred_songs (2026-07-03)
--
-- Two jobs, one operation:
--
--   1. RECONCILE REPO ↔ LIVE DRIFT.
--      20240001_create_user_starred_songs.sql created the table WITH a
--      `created_at timestamptz not null default now()` column, and
--      20260305_songs_migration.sql (which rebuilt song_id TEXT → UUID FK)
--      never dropped it. So the repo history claims created_at exists — but
--      the live table does not have it (the mobile Home "Starred songs" query
--      raised `column user_starred_songs.created_at does not exist`). This is
--      the same kind of repo↔live drift documented in
--      20260609020000_reconcile_secdef_functions.sql. Adding the column brings
--      the live schema back in line with what the migrations already assert.
--
--   2. ENABLE RECENCY ORDERING (the "Option B" durable feature).
--      With created_at present, "most-recently-starred first" ordering becomes
--      possible again for new stars.
--
-- Idempotent and additive: ADD COLUMN IF NOT EXISTS is a no-op on any DB that
-- already has the column, and adding a nullable-defaulted column does not break
-- the currently-deployed app (which orders starred songs by title and does not
-- reference created_at).
--
-- Backfill note: existing rows all take the DEFAULT now() at migration time, so
-- they share one timestamp and their original starring order is NOT recoverable.
-- Only stars created AFTER this migration get distinct, meaningful timestamps.
-- =============================================================================

alter table public.user_starred_songs
  add column if not exists created_at timestamptz not null default now();

-- Supports the per-user "newest starred first" read
-- (where user_id = ? order by created_at desc).
create index if not exists user_starred_songs_user_created_idx
  on public.user_starred_songs (user_id, created_at desc);
