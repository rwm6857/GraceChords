# `api/reflections` — retired public reflections backend

**The public "Shared Reflections" feature is gone.** App Review rejected mobile
1.0.0 (11) under Guideline 1.2 (anonymous user-generated content). PR 469
deleted every client surface and narrowed core's `ReflectionVisibility` to
`'private'`, and migration `20260805000000_retire_public_reflections_age_gate.sql`
retired the backend (`public_reflections` flag **off**, `public_feed_read`
policy **dropped**). Reflections are now a private per-user journal.

**Do not build against anything here without reopening the Guideline 1.2
question first.** This code is kept because it is still deployed.

## Why the endpoints and tables still exist
- Cloudflare Pages routes by file, so `submit.js` and `report.js` respond whether
  or not a client calls them. With the flag off, `submit.js` refuses at its own
  flag check instead of inserting.
- `submit.js` reads `feature_flags` and `banned_users`, and `report.js` writes
  `reports`. Dropping those tables would turn the deployed endpoints into 502s
  instead of clean refusals, so they are **deliberately retained**.
- There is no public read path even if the flag were flipped back: the
  `public_feed_read` policy is dropped.
- The own-row policies (`own_select`/`own_insert`/`own_delete`/`own_update_private`)
  are live and back the private journal.

## How it worked
- Public rows could only enter the DB after moderation: the `own_insert` RLS
  policy is private-only, so a `visibility='public'` row was written **exclusively**
  by this service-role function. There was never a client-facing public insert.
- `_moderation.js` (`moderateText(body, env)`, unit-tested): Layer 1 local checks
  (URLs, `_blocklist.js`, length) short-circuit before Layer 2, OpenAI
  `omni-moderation-latest` (`OPENAI_API_KEY`). It **fails closed**: an API error
  throws `ModerationUnavailable` → 503, no insert. Providers sit behind a registry.
- Backend state came from `20260719000100_public_reflections_backend.sql`:
  `feature_flags`, `banned_users`, `reports`, `reflection_hearts` (+ `heart_count`
  trigger), `reflections.removed_at/removed_reason`, and SECURITY DEFINER helpers
  `is_user_banned` / `feature_enabled`.
- `report.js` → telegram-bot `/internal/report-alert` posts to `DEV_CHANNEL_ID`
  (reuses `BOT_INTERNAL_URL` / `BOT_WEBHOOK_TOKEN`).
