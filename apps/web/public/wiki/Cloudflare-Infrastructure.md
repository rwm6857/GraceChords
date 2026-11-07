# Cloudflare Infrastructure

GraceChords uses three Cloudflare products for hosting, file storage, and serverless compute.

## Cloudflare Pages

The SPA is hosted on Cloudflare Pages.

- **Connected repository**: `rwm6857/GraceChords` (main branch)
- **Root directory**: `apps/web`
- **Build command**: `cd ../.. && npm ci && npm run build -w @gracechords/web`
- **Output directory**: `dist` (→ `apps/web/dist`)
- **Auto-deploy**: every push to `main` triggers a build and deploy

Environment variables (including secrets like `SUPABASE_SERVICE_ROLE_KEY`) are configured in **Cloudflare Pages → Settings → Environment variables**.

### Pages Function: Bible CDN Proxy

`apps/web/functions/bible/[[path]].js` runs as a Cloudflare Pages Function on every request to `/bible/*`. `apps/web/functions/pptx/[[path]].js` does the same for `/pptx/*`.

**Why**: R2 buckets can serve files publicly, but browser requests need a same-origin proxy to avoid CORS issues when the CDN URL differs from the app origin.

**Flow**:
1. Browser requests `/bible/{lang}/{id}/{chapter}.json`
2. Pages Function fetches from `VITE_R2_PUBLIC_URL`, falling back to `BIBLE_CDN_URL` (the R2 public URL)
3. Response returned with `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`

**Environment variable** (set in Pages dashboard; either works):
```
VITE_R2_PUBLIC_URL=https://assets.gracechords.com
BIBLE_CDN_URL=https://pub-xxxx.r2.dev
```

In **local dev**, Vite proxies `/bible/*` and `/pptx/*` to `VITE_R2_PUBLIC_URL`, read from the repo-root `.env` / `.env.local` (a value set in the shell takes precedence).

---

## Cloudflare R2

R2 is used as object storage for large binary assets.

**Bucket**: `gracechords-bible`

| Prefix | Contents |
|--------|----------|
| `pptx/` | PowerPoint slide decks (`{slug}.pptx`) |
| `bible/` | Bible chapter JSON files (`{lang}/{id}/{chapter}.json`) |

R2 has no egress fees. Files are served publicly via the R2 public URL (set as `VITE_R2_PUBLIC_URL`); the web app reads them through the same-origin `/bible/*` and `/pptx/*` Pages Functions, and the mobile app fetches Bible JSON from the public URL directly. Writes go through the `gracechords-pptx-upload` Worker.

---

## Cloudflare Workers

Workers are deployed separately from Pages using Wrangler.

### `gracechords-pptx-upload` (`workers/pptx-upload/`)

Handles PPTX file uploads and deletes for song slide decks.

**Endpoints**:
- `POST /upload` — Upload a `.pptx` file (≤ 20 MB). Requires Editor+ role.
- `DELETE /delete` — Delete a `.pptx` file. Requires Editor+ role.

**Security**:
- Access token is verified by Supabase Auth (`GET /auth/v1/user`), so it survives JWT signing-key rotation
- Role is fetched from `public.users` via `SUPABASE_SERVICE_ROLE_KEY` (not trusted from JWT claims)
- Slug validated against `/^[a-z0-9_]+$/` to prevent path traversal
- CORS enforced against `ALLOWED_ORIGINS` secret
- Per-user upload rate limit (10 uploads / 5 min) via the `RATE_LIMIT_KV` KV binding

**Secrets** (set with `wrangler secret put`):
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ALLOWED_ORIGINS   # comma-separated: https://gracechords.com,...
```

**R2 binding**: `R2_BUCKET` → `gracechords-bible`

**Deploy**:
```bash
cd workers/pptx-upload
npm install
npm run deploy
```

See [`workers/pptx-upload/README.md`](https://github.com/rwm6857/GraceChords/blob/main/workers/pptx-upload/README.md) for full details.

---

### `gracechords-sitemap-rebuild` (`workers/sitemap-rebuild/`)

A scheduled Worker that rebuilds the sitemap on a weekly cron. It POSTs to a Cloudflare Pages deploy hook (`DEPLOY_HOOK_URL` secret), so a fresh production build regenerates the SEO pages and `sitemap.xml`.

**Trigger**: `0 0 * * 0` (Sunday midnight UTC)

**Deploy**:
```bash
cd workers/sitemap-rebuild
wrangler secret put DEPLOY_HOOK_URL
wrangler deploy
```

---

### `gracechords-telegram-bot` (`workers/telegram-bot/`)

Powers `@gracechords_bot`: Telegram DMs and group mentions, a Mon/Fri digest (cron `0 22 * * 1,5`), and `/internal/push` for charts sent from the apps. Bindings: `BOT_KV` (KV), `R2_BUCKET` (`gracechords-bible`, for PDF fonts) and Workers AI. See [`workers/telegram-bot/README.md`](https://github.com/rwm6857/GraceChords/blob/main/workers/telegram-bot/README.md) for secrets and deploy steps.

---

### `gracechords-session-cleanup` (`workers/session-cleanup/`)

A cron Worker (`*/15 * * * *`) that deletes ended live sessions and sessions inactive for longer than `SESSION_TTL_HOURS` (default 24). Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Deploy with `wrangler deploy` from `workers/session-cleanup/`.

---

## Environment variable summary

| Variable | Used by | Where to set |
|----------|---------|-------------|
| `VITE_R2_PUBLIC_URL` | Dev proxy + Pages Functions | repo-root `.env` for `npm run dev` / CF Pages env |
| `BIBLE_CDN_URL` | Pages Functions (fallback) | CF Pages env |
| `VITE_PPTX_WORKER_URL` | SPA frontend | `.env` / CF Pages env |
| Worker secrets | each Worker in `workers/` | `wrangler secret put` |

[[Build-and-Deploy]] [[Slides-(PPTX)]] [[Project-Structure]]
