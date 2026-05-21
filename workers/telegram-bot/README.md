# gracechords-telegram-bot

Cloudflare Worker that powers `@gracechords_bot`. Replaces the old
`.github/workflows/notify_telegram.yml` GitHub Action.

Three surfaces:

| Surface | How it's triggered |
|---|---|
| Direct messages | Telegram webhook → `POST /webhook` |
| Feature announcements | GitHub Action (PR labelled `post` merges) → `POST /internal/feature` |
| Mon/Fri digest | Cloudflare cron → `scheduled()` |

## Provisioning

```bash
# 1. From the repo root:
cd workers/telegram-bot
npm install

# 2. Create the KV namespace and paste the returned id into wrangler.toml
npx wrangler kv:namespace create BOT_KV

# 3. Set the secrets
npx wrangler secret put TELEGRAM_BOT_TOKEN        # from BotFather
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string
npx wrangler secret put DEV_CHANNEL_ID            # negative integer
npx wrangler secret put GRACECHORDS_API_BASE      # e.g. https://www.gracechords.com/api/bot
npx wrangler secret put GRACECHORDS_API_TOKEN     # shared with site's BOT_API_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put BOT_WEBHOOK_TOKEN         # shared with GitHub Action

# 4. Deploy
npx wrangler deploy

# 5. Point Telegram at the worker
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://gracechords-telegram-bot.<your-account>.workers.dev/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

## Bundle size

Free-tier Workers are limited to 3 MiB compressed. To keep us inside the
budget, this Worker imports `src/utils/pdf_mvp/pure.js` from the monorepo
(jsPDF stays as a runtime dep) but **does not bundle the Noto font TTFs**
(~3.3 MB combined). PDFs render with jsPDF's built-in Helvetica/Courier —
legible but not the exact site font.

Run a dry-run after dependency changes:

```bash
npx wrangler deploy --dry-run --outdir dist
ls -lh dist
```

If the script blows past 3 MiB compressed, options in order of preference
are:

1. Drop the JPG path (set `BOT_DISABLE_JPG=1` and short-circuit in
   `pdfRender.js`). Bot falls back to PDF-only via `sendDocument`.
2. Move `@hyzyla/pdfium` and the PNG encoder out into a sibling Worker
   accessible via Service Binding.
3. Upgrade to the $5 Workers paid plan.

## Local dev

```bash
npx wrangler dev
# In another shell, expose the local worker via ngrok or cloudflared tunnel
# and point Telegram's webhook at the tunnel URL.

# Trigger the digest manually
curl 'http://127.0.0.1:8787/__scheduled?cron=0+22+*+*+1'

# Trigger a feature post
curl -X POST http://127.0.0.1:8787/internal/feature \
  -H "Authorization: Bearer ${BOT_WEBHOOK_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","summary":"hello","url":"https://example.com"}'
```

## What lives where

| File | Purpose |
|---|---|
| `src/index.js` | HTTP router + `scheduled()` |
| `src/telegram.js` | Telegram Bot API helpers |
| `src/auth.js` | webhook secret + internal bearer auth |
| `src/supabase.js` | direct DB reads for digest + user lookup |
| `src/ratelimit.js` | KV-backed per-user limiter (30/hr) |
| `src/parseRequest.js` | DM body → setlist items |
| `src/searchClient.js` | calls `/api/bot/*` on gracechords.com |
| `src/pdfRender.js` | PDF (always) + JPG (best-effort, pdfium WASM) |
| `src/digest.js` | scheduled digest builder |
| `src/feature.js` | feature post handler |
| `src/webhook.js` | DM router (messages + callback queries) |
