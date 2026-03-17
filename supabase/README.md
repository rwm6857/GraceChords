# Supabase Migrations

This directory contains SQL migrations for the GraceChords Supabase project.

## Applying Migrations

### Via Supabase Dashboard (simplest)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Run each file in order (ascending filename):
   - `migrations/20240001_create_user_starred_songs.sql`
   - `migrations/20240002_fix_starred_songs_fk.sql`

### Via Supabase CLI

```bash
# Install CLI if needed
npm install -g supabase

# Link to your project (run once)
supabase link --project-ref tndnjetevtgohunqpzbi

# Push all pending migrations
supabase db push
```

## Migration Notes

| File | Purpose |
|------|---------|
| `20240001_create_user_starred_songs.sql` | Creates `user_starred_songs` table with `song_id TEXT` (no FK) and correct RLS policies. Safe to run if table already exists. |
| `20240002_fix_starred_songs_fk.sql` | Drops any foreign-key constraint from `song_id` to a `songs` table. Songs are served from static files in this app — `song_id` is a plain slug string, not a DB row reference. Idempotent. |

## Why no FK on song_id?

Songs in GraceChords are stored as `.chordpro` files in `public/songs/` and indexed via `src/data/index.json`. There is no database-backed `songs` table. The `song_id` column in `user_starred_songs` stores the song slug directly (e.g. `"10-000-reasons"`), which matches the `id` field in `src/data/index.json`.
