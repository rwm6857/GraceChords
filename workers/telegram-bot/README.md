# gracechords-telegram-bot

Cloudflare Worker that powers `@gracechords_bot`. Replaces the old
`.github/workflows/notify_telegram.yml` GitHub Action.

Surfaces:

| Surface | How it's triggered |
|---|---|
| Direct messages | Telegram webhook → `POST /webhook` (`chat.type === 'private'`) |
| Group / guest-chat mentions | Same webhook, when the bot is `@`-mentioned in a group/supergroup |
| Feature announcements | GitHub Action (PR labelled `post`, or `#post` in PR title/body) → `POST /internal/feature` |
| Mon/Fri digest | Cloudflare cron → `scheduled()` |

## Group chat behaviour

The bot listens to group/supergroup messages only when it is explicitly
`@`-mentioned. To allow mentions from groups the bot has not been added
to, enable **Guest Chat Mode** in BotFather → Bot Settings → Mode
Settings. Account linking is **not** required in groups — anyone in the
chat can summon the bot — but a per-chat cooldown
(`src/groupRateLimit.js`, 6 renders per minute) keeps things from going
sideways. Replies thread to the originating message via
`reply_to_message_id` so they don't get lost in busy chats.

### Guest-chat photo delivery

Guest-mode replies (`update.guest_message`) go through Telegram's
`answerGuestQuery` method, which only accepts URLs or file_ids — not
raw bytes. To send the chord-chart JPG without external hosting, the
bot uploads each chart to a private staging chat, captures the
`file_id` Telegram returns, references that file_id in the guest
reply, then deletes the staging message. The recipient still sees the
photo because the file backing the file_id outlives the source
message.

To set this up:

1. Create a Telegram channel (or group) with just yourself + the bot.
   This is the scratch space — messages there are auto-deleted after
   use, but the channel itself stays around.
2. Add the bot as an admin with **both Post Messages and Delete
   Messages** permissions.
3. Send any message in the channel to make Telegram surface its ID
   (e.g. via `@RawDataBot` or by forwarding to `@JsonDumpBot`).
4. `npx wrangler secret put MEDIA_STAGING_CHAT_ID` — paste the
   negative integer.

There is no file_id cache: every guest request re-stages and re-
deletes. This keeps lyric/chord edits visible instantly with no
staleness window, and the Telegram round-trip cost is negligible for
worship traffic volumes.

If `MEDIA_STAGING_CHAT_ID` isn't set or the upload fails, the bot
falls back to a text reply with a link to the song page on
gracechords.com.

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
npx wrangler secret put MEDIA_STAGING_CHAT_ID     # private chat ID; see "Guest chat behaviour"

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
| `src/aiSummary.js` | Workers AI rewrite for feature posts (with fallback) |
| `src/groupRateLimit.js` | per-chat cooldown for group/guest-chat traffic |
| `src/mediaCache.js` | stage-then-delete helper for guest-mode photo replies |
| `src/webhook.js` | DM + group + guest router (messages + callback queries) |
