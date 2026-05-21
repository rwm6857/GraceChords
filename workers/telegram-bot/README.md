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

# 3. Upload the six Noto TTFs to R2 (one-time; only needed when fonts change)
for f in ../../src/assets/fonts/NotoSans-Regular.ttf \
         ../../src/assets/fonts/NotoSans-Bold.ttf \
         ../../src/assets/fonts/NotoSans-Italic.ttf \
         ../../src/assets/fonts/NotoSans-BoldItalic.ttf \
         ../../src/assets/fonts/NotoSansMono-Regular.ttf \
         ../../src/assets/fonts/NotoSansMono-Bold.ttf; do
  npx wrangler r2 object put \
    "gracechords-bible/fonts/$(basename "$f")" \
    --file="$f" \
    --content-type="font/ttf"
done

# 4. Set the secrets
npx wrangler secret put TELEGRAM_BOT_TOKEN        # from BotFather
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string
npx wrangler secret put DEV_CHANNEL_ID            # negative integer
npx wrangler secret put GRACECHORDS_API_BASE      # e.g. https://www.gracechords.com/api/bot
npx wrangler secret put GRACECHORDS_API_TOKEN     # shared with site's BOT_API_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put BOT_WEBHOOK_TOKEN         # shared with GitHub Action

# 5. Deploy
npx wrangler deploy

# 6. Point Telegram at the worker
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://gracechords-telegram-bot.<your-account>.workers.dev/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

## Bundle size

Free-tier Workers are limited to 3 MiB compressed. We currently fit
inside that budget with the following layout:

- **Noto TTFs** (~3.3 MB) live in the `gracechords-bible` R2 bucket
  under `fonts/`. The first PDF render per worker isolate fetches all
  six in parallel and caches the base64-encoded payload in module
  scope. R2 reads from the same worker cost nothing and finish in tens
  of milliseconds.
- **pdfium WASM** (~2 MB compressed) is bundled into the worker
  script at deploy time via `import pdfiumWasmModule from
  '@hyzyla/pdfium/pdfium.wasm'`. Wrangler precompiles it into a
  `WebAssembly.Module` and we hand that to pdfium through Emscripten's
  `instantiateWasm` hook.

> **Important:** Cloudflare Workers refuse
> `WebAssembly.instantiate(buffer)` ("Wasm code generation disallowed by
> embedder"). Any WASM must be bundled at deploy time so the runtime
> only ever sees a precompiled `WebAssembly.Module`. Do not switch back
> to a runtime fetch from CDN or R2 — that path is permanently blocked.

If pdfium init fails at runtime the bot transparently falls back: JPG
path drops to PDF via `sendDocument`. The same fallback handles the
"Get as PDF" inline button under each photo.

Run a dry-run after dependency changes to check the bundle size against
the 3 MiB ceiling:

```bash
npm run dry-run
ls -lh dist
```

If a future change blows past 3 MiB compressed, options in order of
preference are:

1. Drop the JPG path (short-circuit `getPdfium()` in `pdfRender.js` to
   return null unconditionally). Bot falls back to PDF-only via
   `sendDocument`. Cuts ~2 MB.
2. Move `@hyzyla/pdfium` and the PNG encoder out into a sibling Worker
   accessible via Service Binding.
3. Upgrade to the $5 Workers paid plan (10 MiB ceiling).

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
