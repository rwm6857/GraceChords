# gracechords-pptx-upload Worker

Handles PPTX file uploads and deletions for GraceChords songs. Files are stored in Cloudflare R2 (`gracechords-bible` bucket, `pptx/` prefix).

## Endpoints

- `POST /upload` — Upload a PPTX. Requires Editor+ role.
- `DELETE /delete` — Delete a PPTX. Requires Editor+ role.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set secrets:
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put ALLOWED_ORIGINS
   ```

   - `SUPABASE_URL`: your project URL (e.g. `https://xyz.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY`: found in Supabase dashboard → Settings → API → service_role key
   - `ALLOWED_ORIGINS`: comma-separated list of allowed frontend origins (e.g. `https://gracechords.com,https://migration.gracechords-app.pages.dev`)

3. The rate-limit KV namespace (`RATE_LIMIT_KV`) is already provisioned and
   its id is committed in `wrangler.toml`. The binding name must remain
   `RATE_LIMIT_KV` — the worker reads `env.RATE_LIMIT_KV`.

4. Deploy:
   ```bash
   npm run deploy
   ```

5. Copy the deployed worker URL and set it in the SPA's environment:
   ```env
   VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev
   ```

## Local dev

```bash
npm run dev
```

Runs the Worker locally via Wrangler. R2 bindings use a local simulation. You will need to set secrets locally via `.dev.vars` (see Wrangler docs) — do **not** commit that file.

## Security notes

- The caller's access token is verified by Supabase Auth (`GET /auth/v1/user`) before any R2 operation. The worker does not check signatures itself — the project uses asymmetric JWT signing keys, so the legacy `SUPABASE_JWT_SECRET` can't verify session tokens
- Role is fetched from `public.users` via service role key — not trusted from the JWT claims
- Slug is validated against `/^[a-z0-9_]+$/` before use as an R2 key
- File type and size are validated before upload (`.pptx` only, 20MB max)
- CORS is enforced against the `ALLOWED_ORIGINS` secret — requests from unlisted origins receive no `Access-Control-Allow-Origin` header
- Per-user upload rate limit: 10 uploads / 5 min sliding window, enforced via the `RATE_LIMIT_KV` binding. Exceeding the limit returns `429` with a `Retry-After` header. If the binding is unset (e.g. local dev without KV) the limit is bypassed.
