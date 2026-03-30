# Cloudflare Infrastructure

GraceChords uses three Cloudflare products for hosting, file storage, and serverless compute.

## Cloudflare Pages

The SPA is hosted on Cloudflare Pages.

- **Connected repository**: `rwm6857/GraceChords` (main branch)
- **Build command**: `npm run build`
- **Output directory**: `dist/`
- **Auto-deploy**: every push to `main` triggers a build and deploy

Environment variables (including secrets like `SUPABASE_SERVICE_ROLE_KEY`) are configured in **Cloudflare Pages → Settings → Environment variables**.

### Pages Function: Bible CDN Proxy

`functions/bible/[[path]].js` runs as a Cloudflare Pages Function on every request to `/bible/*`.

**Why**: R2 buckets can serve files publicly, but browser requests need a same-origin proxy to avoid CORS issues when the CDN URL differs from the app origin.

**Flow**:
1. Browser requests `/bible/{lang}/{id}/{chapter}.json`
2. Pages Function fetches from `BIBLE_CDN_URL` (the R2 public URL)
3. Response returned with `Cache-Control: max-age=86400`

**Environment variable** (set in Pages dashboard):
```
BIBLE_CDN_URL=https://pub-xxxx.r2.dev
```

In **local dev**, Vite proxies `/bible/*` to `VITE_R2_PUBLIC_URL` (set in `.env.local`).

---

## Cloudflare R2

R2 is used as object storage for large binary assets.

**Bucket**: `gracechords-bible`

| Prefix | Contents |
|--------|----------|
| `pptx/` | PowerPoint slide decks (`{slug}.pptx`) |
| `bible/` | Bible chapter JSON files (`{lang}/{id}/{chapter}.json`) |

R2 has no egress fees. Files are served publicly via the R2 public URL (set as `VITE_R2_PUBLIC_URL`) or downloaded via a Worker endpoint.

---

## Cloudflare Workers

Workers are deployed separately from Pages using Wrangler.

### `gracechords-pptx-upload` (`workers/pptx-upload/`)

Handles PPTX file uploads and deletes for song slide decks.

**Endpoints**:
- `POST /upload` — Upload a `.pptx` file (≤ 20 MB). Requires Collaborator+ role.
- `DELETE /delete` — Delete a `.pptx` file. Requires Editor+ role.

**Security**:
- JWT is verified using HMAC-SHA256 against `SUPABASE_JWT_SECRET`
- Role is fetched from `public.users` via `SUPABASE_SERVICE_ROLE_KEY` (not trusted from JWT claims)
- Slug validated against `/^[a-z0-9_]+$/` to prevent path traversal
- CORS enforced against `ALLOWED_ORIGINS` secret

**Secrets** (set with `wrangler secret put`):
```
SUPABASE_URL
SUPABASE_JWT_SECRET
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

See [`workers/pptx-upload/README.md`](../workers/pptx-upload/README.md) for full details.

---

### `gracechords-sitemap-rebuild` (`workers/sitemap-rebuild/`)

A scheduled Worker that rebuilds the sitemap on a weekly cron.

**Trigger**: `0 0 * * 0` (Sunday midnight UTC)

**Deploy**:
```bash
cd workers/sitemap-rebuild
wrangler deploy
```

---

## Environment variable summary

| Variable | Used by | Where to set |
|----------|---------|-------------|
| `VITE_R2_PUBLIC_URL` | Dev proxy + Pages Function | `.env.local` / CF Pages env |
| `VITE_PPTX_WORKER_URL` | SPA frontend | `.env` / CF Pages env |
| Worker secrets | `gracechords-pptx-upload` | `wrangler secret put` |

[[Build-and-Deploy]] [[Slides-(PPTX)]] [[Project-Structure]]
