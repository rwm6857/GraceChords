# gracechords-telegram-bot — Architecture Notes

Companion document to `README.md`. The README covers provisioning and
operations. This file covers how the bot is wired internally, what
the constraints are, and the non-obvious decisions a future change has
to respect.

Read both before making structural changes.

## Purpose

`@gracechords_bot` lets a worship leader DM a song title (or a
comma-separated setlist) and receive the chord chart as an inline photo,
with an option to fetch the PDF version. It also handles two scheduled
or workflow-driven flows that used to live in `notify_telegram.yml`:
feature post announcements and the Mon/Fri digest.

Replaces the old GitHub Action; that workflow can be deleted.

## Three surfaces

| Surface | Trigger | Entry point in `src/index.js` |
|---|---|---|
| Direct messages | Telegram webhook POST | `POST /webhook` |
| Feature announcements | `feature-post.yml` workflow on PR merge with `post` label | `POST /internal/feature` |
| Mon + Fri digest | Cloudflare cron `0 22 * * 1,5` | `scheduled()` handler |

`src/index.js` is the HTTP router; auth lives in `src/auth.js`. Each
surface dispatches to a dedicated module.

## Code map

| File | Responsibility |
|---|---|
| `src/index.js` | HTTP router + `scheduled()`. Verifies webhook secret, dispatches. |
| `src/auth.js` | `verifyTelegramWebhook()` and internal bearer auth for `/internal/feature`. |
| `src/webhook.js` | DM router. Handles `/start`, `/help`, free-text song queries, callback queries from inline buttons. Owns the JPG-vs-PDF UX. |
| `src/parseRequest.js` | DM text → list of `{ title, key? }` items. Handles "Song A in G, Song B" syntax. |
| `src/searchClient.js` | Calls the site's `/api/bot/*` Pages Functions. Talks to `songs/search`, `song/[id]`, `setlist`. Also classifies match quality (auto vs disambiguate vs no-match). |
| `src/supabase.js` | Direct DB reads via PostgREST. Used for `findUserByTelegramId` and the digest's recent-songs/posts queries. |
| `src/ratelimit.js` | KV-backed per-user limiter — 30 requests / hour. |
| `src/pdfRender.js` | PDF generation (always) and JPG rasterization (best-effort). Imports the shared `pdf_mvp/pure.js` engine + jsPDF; uses bundled pdfium WASM to rasterize the resulting PDF to PNG bytes for `sendPhoto`. |
| `src/fontsWorker.js` | Lazy R2 fetch + base64 of Noto TTFs for the PDF engine. Cached in module scope. |
| `src/digest.js` | Builds the Mon/Fri digest message from recent Supabase rows. |
| `src/feature.js` | Handles `POST /internal/feature` from the GitHub Action. |
| `src/telegram.js` | Bot API helpers: `sendMessage`, `sendPhoto`, `sendDocument`, `sendMediaGroup`, `sendChatAction`, `answerCallbackQuery`. |

`src/pdfRender.js` is the most consequential file — it touches the
WASM, jsPDF, transposition, and the chord-chart engine in
`../../src/utils/pdf_mvp/pure.js` (shared with the site).

## Request lifecycle — DM with a song title

1. Telegram POSTs the update to `/webhook` with the secret header.
2. `auth.verifyTelegramWebhook` checks `X-Telegram-Bot-Api-Secret-Token`
   against `TELEGRAM_WEBHOOK_SECRET`.
3. `handleTelegramUpdate` in `webhook.js` filters to private-chat text
   and dispatches `handleTextMessage`.
4. `getLinkedUser` checks BOT_KV (`userlookup:<tg_id>`) → falls through
   to `findUserByTelegramId` (Supabase) on miss. Onboarding text if not
   linked.
5. `parseRequest(text)` produces `[{ title, key }]` items.
6. `checkRateLimit` consumes one slot from the KV bucket.
7. For each item: `searchSongs(env, title)` → `classifyMatch(results)`.
   - `auto`: pick the top result.
   - `choose`: send an inline keyboard with up to 3 candidates.
   - `none`: "couldn't find that" reply.
8. `fetchSong(env, id)` (or `fetchSetlistSongs` for multi) loads full
   ChordPro from the site's bot-only API.
9. `renderSongJpg` parses + transposes the song (see Transposition
   below), renders to PDF via the shared engine, then rasterizes to PNG
   via pdfium. Returns `null` on any failure; caller falls back to
   `renderSongPdf` + `sendDocument`.
10. `sendPhoto` posts the PNG with a "📄 Get as PDF" inline button
    (callback data: `pdf:<song_id>:<key>`).
11. The PDF button is wired through `handleCallbackQuery` →
    `renderSongPdf` → `sendDocument`.

Setlists follow the same skeleton but use `fetchSetlistSongs`,
`sendMediaGroup`, and a `setlist:<token>` callback for the combined
PDF (KV-backed token so we don't blow Telegram's callback_data limit).

## External integrations

### Telegram Bot API
- All calls go through `src/telegram.js`. Always use those helpers — they
  set the right content types and handle Telegram's quirky form-data
  endpoints (`sendPhoto`, `sendDocument`, `sendMediaGroup`).
- Inline keyboards must keep `callback_data` under 64 bytes; if you need
  more, stash a token in BOT_KV and put the token in the callback (see
  the setlist flow for the pattern).

### Site bot-only API (Pages Functions)
- Worker calls `${GRACECHORDS_API_BASE}/songs/search`, `/song/<id>`, and
  `/setlist` with `Authorization: Bearer ${GRACECHORDS_API_TOKEN}`.
- Site checks the bearer against `env.BOT_API_TOKEN`. **Names differ on
  purpose** — `GRACECHORDS_API_TOKEN` on the worker side,
  `BOT_API_TOKEN` on the Pages side. Values must match.
- **`GRACECHORDS_API_BASE` must hit the canonical site domain** — if
  `www` vs apex redirects with a 301, POST requests downgrade to GET and
  every setlist call returns 405. Current setting is the apex
  `https://gracechords.com/api/bot`.

### Supabase
- Worker reads only — `findUserByTelegramId`, digest queries.
- All reads use `SUPABASE_SERVICE_ROLE_KEY`. Treat as root credentials.
- The site's `/api/telegram/link` endpoint (Pages Function) verifies the
  user's auth JWT by calling Supabase's `/auth/v1/user` rather than
  HMAC-verifying locally — works across legacy HS256 and the newer
  asymmetric ECC JWT signing keys without code changes.

### R2 (`gracechords-bible`)
- Noto TTFs under `fonts/` — fetched on first PDF render per isolate,
  cached as base64 in module scope.
- The bot previously stored `pdfium/pdfium.wasm` here. **No longer
  read** (see Bundle constraints). Safe to delete from R2.

### Cloudflare KV (`BOT_KV`)
- `ratelimit:<tg_id>` — token bucket, 30/hr.
- `userlookup:<tg_id>` — user row cache; TTL set in `webhook.js`.
- `setlist:<token>` — short-lived ID for combined-PDF callback.
- `lastdigest:<channel_id>` — debounces digest cron.

## Transposition

`pdfRender.js#toRenderableSong` is responsible for transposition because
the shared PDF engine in `pdf_mvp/pure.js` renders chord syms verbatim.
The site does the same dance in `SongViewPage.jsx` before its PDF
download path.

Flow: parse ChordPro → `stepsBetween(originalKey, targetKey)` →
`transposeSymPrefer(sym, steps, preferFlat)` for every
`{ sym, index }` on every line, plus `instrumental.chords` at both line
and section level. `preferFlat` is true when the target key contains a
`b`.

If you add a new field that holds chord syms, you must transpose it
here too. Failing to do so produces the symptom we hit at one point:
correct title and "Key of G" subtitle but original-key chords on the
page.

## Bundle constraints (READ BEFORE TOUCHING `pdfRender.js`)

Free-tier Workers limit the script to **3 MiB compressed**. We're
currently close to that ceiling. Layout:

- **Noto TTFs** (~3.3 MB) live in R2. Bundled-in approach was rejected
  because it blows the budget.
- **pdfium WASM** (~2 MB compressed) is **bundled at deploy time** via
  `import pdfiumWasmModule from '@hyzyla/pdfium/pdfium.wasm'`. Wrangler's
  bundler resolves the subpath via package.json exports and turns the
  `.wasm` import into a precompiled `WebAssembly.Module`.

> **Hard constraint:** Cloudflare Workers reject
> `WebAssembly.instantiate(buffer)` with "Wasm code generation
> disallowed by embedder". WASM **must** be bundled. Do not switch back
> to runtime CDN fetch (`@hyzyla/pdfium/browser/cdn`), R2 fetch, or any
> other "load bytes at runtime" pattern — they're all blocked by the
> same policy. The Emscripten `instantiateWasm` hook is how we feed
> pdfium our pre-bound module.

If a future change pushes the bundle past 3 MiB:
1. Set `getPdfium()` to return null unconditionally → drops the JPG
   path, bot falls back to PDF-only via `sendDocument`. Saves ~2 MB.
2. Move `@hyzyla/pdfium` + the PNG encoder into a sibling Worker
   accessed via Service Binding (each worker has its own 3 MiB).
3. Upgrade to the $5 Workers Paid plan (10 MiB ceiling).

Always run `npm run dry-run` and check `dist/` size after dependency
changes.

## Fallback behavior — what happens when things fail

| Failure | Behavior |
|---|---|
| pdfium init fails | `_pdfiumFailedUntil` set 60s out. `renderSongJpg` returns null. Caller sends PDF via `sendDocument`. After TTL, next request retries init. |
| R2 fonts unreachable | PDF engine falls back to jsPDF's built-in Helvetica/Courier. Output is still legible. |
| Site API 401 / token mismatch | `searchSongs` throws "search failed: 401" → generic "Something went wrong" reply. |
| Telegram webhook secret mismatch | 401 from `verifyTelegramWebhook`. Visible in `getWebhookInfo` as `last_error_message`. |
| Rate limit hit | "Whoa, slow down — try again in N min" reply. |
| Setlist with no matches | "I couldn't read that. Try a title like ..." |
| pdfium loadDocument / render throws | Warn to log, return null, fall back to PDF. |

The general principle: **always deliver something usable**. A PDF
document is always preferable to a silent failure.

## Common pitfalls (history from the deploy session)

- **`parseChordPro` vs `parseChordProOrLegacy`**: the parser only
  exports the latter. Don't change the import path back.
- **jsPDF default vs named import**: in the shared `pure.js`, use
  `import { jsPDF } from 'jspdf'`. The default import resolves to a
  namespace under esbuild + nodejs_compat and breaks the constructor.
- **Sibling vs nested `_shared.js` imports**: `functions/api/bot/setlist.js`
  is a sibling of `_shared.js`. `songs/search.js` and `song/[id].js`
  are one level deeper. Verify import paths against the actual file
  depth — wrong relative paths fail Pages Functions bundling silently
  for that one file, but Cloudflare aborts the whole Functions build.
- **www/apex 301 redirects downgrade POST → GET**: keep
  `GRACECHORDS_API_BASE` on the canonical domain or your `setlist`
  endpoint will 405.
- **Worker secrets ≠ Pages env vars**: `SUPABASE_URL` on Pages is a
  different storage location from `SUPABASE_URL` on the worker. Set
  both. `VITE_*` prefixed values only inject into the client bundle —
  Pages Functions need the non-VITE name.

## Where to add things

| Change | File |
|---|---|
| New text command (e.g., `/about`) | `src/webhook.js`, before the free-text handler |
| New inline button | `src/webhook.js` callback handler + the place that sends the button |
| New site API endpoint | `src/searchClient.js` (worker side) + `functions/api/bot/<name>.js` (site side) |
| Change rendering output | `src/pdfRender.js` |
| Change rate limits | `src/ratelimit.js` |
| Add a digest content type | `src/digest.js` + Supabase query |
| Add a secret | `wrangler secret put …` AND document in `README.md` |
| Bigger bundle | Check `npm run dry-run` first |

## Related references

- `README.md` — provisioning, secrets, local dev.
- `../../src/utils/pdf_mvp/pure.js` — shared PDF engine.
- `../../src/utils/chordpro/parser.ts` — ChordPro parser (used by site
  and bot).
- `../../src/utils/chordpro/index.js` — `stepsBetween`,
  `transposeSymPrefer`.
- `../../functions/api/bot/*` — site-side bot API.
- `../../functions/api/telegram/link.js` — Telegram Login Widget linking.
- `../../.github/workflows/feature-post.yml` — feature post trigger.
