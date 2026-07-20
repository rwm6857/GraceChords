# session-cleanup worker

Cloudflare cron worker that keeps the `sessions` table (live Sessions feature)
tidy. Standalone — not an npm workspace member; deploy it on its own.

## What it does

On each cron tick (`*/15 * * * *`) it deletes:

1. **Ended sessions** — `status = 'ended'` (the leader tapped "End session").
2. **Abandoned sessions** — `last_active_at` older than `SESSION_TTL_HOURS`
   (default 24h), i.e. a leader that crashed or closed the app without ending.

Deletes go through the Supabase REST API with the **service-role key**, which
bypasses RLS — the `sessions` table has no client DELETE policy on purpose, so
this worker is the only thing that removes rows.

## Deploy

```sh
cd workers/session-cleanup
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler deploy
```

`SESSION_TTL_HOURS` is a plain var in `wrangler.toml` (change it there).

## Notes

- The migration must be applied first (`supabase/migrations/*_sessions.sql`).
- Logs report how many ended + stale rows each run removed (observability on).
