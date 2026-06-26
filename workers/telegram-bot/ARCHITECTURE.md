# gracechords-telegram-bot — Architecture Notes

Companion document to `README.md`. The README covers provisioning and
operations. This file covers how the bot is wired internally, what
the constraints are, and the non-obvious decisions a future change has
to respect.

Read both before making structural changes.

## Purpose

`@gracechords_bot` lets a worship leader DM a song title (or a
comma-separated setlist) and receive the chord chart as an inline photo,
with an option to fetch the PDF version. The same flow runs in groups
where the bot is mentioned, and — with Guest Chat Mode enabled in
BotFather — in groups the bot has not been added to. It also handles
two scheduled or workflow-driven flows that used to live in
`notify_telegram.yml`: feature post announcements (rewritten via
Workers AI for the dev-channel audience) and the Mon/Fri digest.

Replaces the old GitHub Action; that workflow can be deleted.

## Surfaces

| Surface | Trigger | Entry point in `src/index.js` |
|---|---|---|
| Direct messages | Telegram webhook POST (`chat.type === 'private'`) | `POST /webhook` |
| Group / supergroup mentions | Same webhook, when the bot is `@`-mentioned in a group it's a member of | `POST /webhook` |
| Guest-chat mentions | Same webhook, payload arrives under `update.guest_message` (BotFather → Guest Chat Mode → On) | `POST /webhook` |
| Feature announcements | `feature-post.yml` on PR merge — fires on `feat(` prefix OR `post` label OR `#post` in title/body. Body is rewritten through Workers AI before posting. | `POST /internal/feature` |
| Mon + Fri digest | Cloudflare cron `0 22 * * 1,5` | `scheduled()` handler |

`src/index.js` is the HTTP router; auth lives in `src/auth.js`. Each
surface dispatches to a dedicated module. The webhook handler in
`webhook.js` is itself a mini-router that splits private/group/guest
flows based on chat type and the presence of `update.guest_message`.

## Code map

| File | Responsibility |
|---|---|
| `src/index.js` | HTTP router + `scheduled()`. Verifies webhook secret, dispatches. |
| `src/auth.js` | `verifyTelegramWebhook()` and internal bearer auth for `/internal/feature`. |
| `src/webhook.js` | Router for DM, group, and guest-chat flows. Handles `/start`, `/help`, free-text song queries, callback queries from inline buttons, and the dedicated `handleGuestMessage` path. Owns the JPG-vs-PDF UX. |
| `src/parseRequest.js` | Message text → list of `{ title, key? }` items. Handles "Song A in G, Song B" syntax. Same parser is used by all three message flows. |
| `src/searchClient.js` | Calls the site's `/api/bot/*` Pages Functions. Talks to `songs/search`, `song/[id]`, `setlist`. Also classifies match quality (auto vs disambiguate vs no-match); `classifyMatch(results, query)` short-circuits to `auto` when any candidate's title exactly equals the parsed query. |
| `src/supabase.js` | Direct DB reads via PostgREST. Used for `findUserByTelegramId` and the digest's recent-songs/posts queries. |
| `src/ratelimit.js` | KV-backed per-user limiter for DM — 30 requests / hour. |
| `src/groupRateLimit.js` | KV-backed per-chat cooldown for group + guest traffic — 6 renders / minute. Independent of the DM limiter. |
| `src/pdfRender.js` | PDF generation (always) and JPG rasterization (best-effort). Imports the shared `pdf_mvp/pure.js` engine + jsPDF; uses bundled pdfium WASM to rasterize the resulting PDF to PNG bytes for `sendPhoto`. |
| `src/fontsWorker.js` | Lazy R2 fetch + base64 of Noto TTFs for the PDF engine. Cached in module scope. |
| `src/digest.js` | Builds the Mon/Fri digest message from recent Supabase rows. |
| `src/feature.js` | Handles `POST /internal/feature` from the GitHub Action. Strips the conventional-commit prefix, skips posting when the PR body is empty, otherwise pipes title+body through Workers AI before sending. |
| `src/aiSummary.js` | Workers AI wrapper. Calls `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with a worship-leader-friendly system prompt; returns HTML-escaped text or `null` (the model can self-veto by returning `SKIP`). Caller falls back to the raw body on null. |
| `src/mediaCache.js` | `stagePhoto(env, …)` — upload a JPG to `MEDIA_STAGING_CHAT_ID`, return `{ fileId, chatId, messageId }`. Used by the guest-message flow; the caller deletes the staging message after `answerGuestQuery` ships. No cache — every call re-stages. |
| `src/telegram.js` | Bot API helpers: `sendMessage`, `sendPhoto`, `sendDocument`, `sendMediaGroup`, `sendChatAction`, `answerCallbackQuery`, `answerGuestQuery` (InlineQueryResult-shaped), `deleteMessage`, `getMe`. |

`src/pdfRender.js` is the most consequential file — it touches the
WASM, jsPDF, transposition, and the chord-chart engine in
`../../src/utils/pdf_mvp/pure.js` (shared with the site).

## Request lifecycle — DM with a song title

1. Telegram POSTs the update to `/webhook` with the secret header.
2. `auth.verifyTelegramWebhook` checks `X-Telegram-Bot-Api-Secret-Token`
   against `TELEGRAM_WEBHOOK_SECRET`.
3. `handleTelegramUpdate` in `webhook.js` inspects the update:
   - `update.message` with `chat.type === 'private'` → DM flow (this section).
   - `update.message` with `chat.type === 'group' | 'supergroup'` → group flow (next section).
   - `update.guest_message` present → guest flow (section after).
   - Anything else (channel_post, edited_*) is silently ignored.
4. `getLinkedUser` checks BOT_KV (`userlookup:<tg_id>`) → falls through
   to `findUserByTelegramId` (Supabase) on miss. Onboarding text if not
   linked. `/start` and `/help` route to `startText(name)` and
   `helpText()` respectively when the user is linked.
5. `parseRequest(text)` produces `[{ title, key }]` items.
6. `checkRateLimit` consumes one slot from the per-user KV bucket.
7. `advanceResolution` (`resolver.js`) walks the items, calling
   `searchSongs` → `classifyMatch(results, item.title)` for each. The
   second arg is the original parsed query; if any candidate's title
   equals it (case- and whitespace-insensitive), the result is `auto`
   regardless of scores.
   - `auto`: append the pick and continue to the next item.
   - `choose`: send an inline keyboard with up to 4 candidates
     (`callback_data: rpick:<song_id>`), stash progress in BOT_KV under
     `resolve:<scope>`, and stop. When the user taps a button,
     `handleCallbackQuery` records the pick and **resumes** the walk — so
     a confusing title midway through a setlist no longer abandons the
     rest of the set; the whole setlist is delivered once resolved.
   - `none`: "couldn't find that" reply (aborts the whole request).
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

Setlists follow the same skeleton but with one twist: each chart is
sent as its own `sendPhoto` (caption `N. Title — Key`), and the *last*
photo carries the "📄 Get setlist as PDF" inline button. We deliberately
do **not** use `sendMediaGroup` for setlists — it doesn't accept
`reply_markup`, which would force a separate preamble message just to
host the button. The PDF callback stashes the setlist items in
BOT_KV under `setlist:<token>` because Telegram's `callback_data` is
capped at 64 bytes.

## Request lifecycle — group / supergroup mention

Same as DM with three differences:

- Webhook only proceeds when `message.entities` contains a `mention`
  whose slice equals `@<bot_username>` (lowercased; bot username is
  cached per isolate via `getMe`). Other group chatter is silently
  ignored.
- Account linking is bypassed — anyone in the chat can summon the bot.
  `checkGroupRateLimit` enforces 6 renders / minute per chat instead.
- All outgoing messages set `reply_to_message_id` to the originating
  message so replies stay anchored in busy chats.

The mention text is stripped before being passed to `parseRequest`, so
the rest of the pipeline is identical to DM.

## Request lifecycle — guest_message (Guest Chat Mode)

`update.guest_message` is the envelope Telegram uses for bots that
have Guest Chat Mode enabled in BotFather. The message itself is a
standard `Message` object **plus** three extra fields:
`guest_query_id`, `guest_bot_caller_user`, and `guest_bot_caller_chat`.

The reply does **not** go through `sendPhoto` / `sendMessage` to a
chat id — instead it goes through `answerGuestQuery` bound to the
`guest_query_id` token. The accepted shape (discovered empirically;
not in the public Bot API docs at time of writing) is a single
`result` field that mirrors the inline-query result types:

- Text: `InlineQueryResultArticle` wrapping `InputTextMessageContent`.
- Photo: `InlineQueryResultCachedPhoto` with a `photo_file_id`. Raw
  bytes are not accepted — the JPG has to be uploaded somewhere first
  to get a file_id.

The flow in `handleGuestMessage`:

1. Strip the `@<bot>` mention and dispatch via the existing
   `parseRequest` → `advanceResolution` (`resolver.js`) pipeline.
2. For a single-song match, render the JPG.
3. `stagePhoto(env, …)` uploads the JPG to `MEDIA_STAGING_CHAT_ID` (a
   private chat the bot has Post + Delete permissions on) and returns
   the resulting `file_id`.
4. `answerGuestQuery` ships the reply using
   `InlineQueryResultCachedPhoto` referencing the staged file_id.
5. `ctx.waitUntil(deleteMessage(…))` cleans up the staging message
   best-effort. The recipient still sees the photo because Telegram
   keeps the file alive after the source message is deleted.

Setlists work in guest mode too, but they can't be delivered the DM way
(a single `answerGuestQuery` call delivers one message, with no inline
buttons and no media-group equivalent). Instead the whole set ships as
one combined PDF via `InlineQueryResultCachedDocument`: `renderSetlistPdf`
→ `stageDocument` (uploads the PDF to `MEDIA_STAGING_CHAT_ID`, captures a
document `file_id`) → `answerGuestQuery({ documentFileId, … })` →
best-effort `deleteMessage` of the staging copy. If rendering or staging
fails, it falls back to a text reply listing each song title, key, and
its gracechords.com link.

Disambiguation collapses to a numbered text reply (no inline buttons in
guest mode), driven by the same `resolver.js` state machine as DM/group
but stashed under `resolve:guest:<caller_id>` (10-min TTL). A follow-up
message that is just a number — e.g. `@gracechords_bot 2` — is
intercepted in `handleGuestMessage` (before `parseRequest`), applied as
the pick, and the resolution **resumes** so a confusing title inside a
guest setlist still produces the full set. The mention is required:
Guest Chat Mode only delivers messages that `@`-mention the bot, so a
bare `2` never reaches us. With no pending list, a number falls through
to a normal search. Any failure in the single-song photo path falls back
to a text reply with the song title, key, and a deep link to the song
page on gracechords.com — same fallback as when `MEDIA_STAGING_CHAT_ID`
isn't configured at all.

## External integrations

### Telegram Bot API
- All calls go through `src/telegram.js`. Always use those helpers — they
  set the right content types and handle Telegram's quirky form-data
  endpoints (`sendPhoto`, `sendDocument`, `sendMediaGroup`).
- Inline keyboards must keep `callback_data` under 64 bytes; if you need
  more, stash a token in BOT_KV and put the token in the callback (see
  the setlist flow for the pattern).
- Guest replies use `answerGuestQuery` and **must** be wrapped in a
  single `result` field shaped like an `InlineQueryResult` (e.g.
  article + InputTextMessageContent for text, cached photo + file_id
  for a single chart, cached document + file_id for a combined setlist
  PDF — `InlineQueryResultCachedDocument` requires a non-empty `title`).
  Bare `text` / `photo` at the top level returns
  `"result isn't specified"` with HTTP 400. The cached-document path is
  undocumented like the rest of guest mode; if a guest setlist comes
  back empty, suspect this shape first.

### Workers AI
- Binding: `AI` (configured in `wrangler.toml`).
- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via `env.AI.run(…)`.
- Only used by `feature.js` to rewrite PR titles and bodies into a
  warm, end-user-facing tone for the dev channel. Any failure (binding
  missing, quota, transient) falls back to the raw PR body so a deploy
  or AI outage never silently drops an announcement.
- Empty-body PRs short-circuit before the AI call — we'd rather post
  nothing than ask the model to invent user-facing copy from a
  conventional-commit title alone.
- The system prompt in `src/aiSummary.js` bans specific filler phrases
  ("improvements", "smoothly", "more reliable", etc.) and exposes a
  `SKIP` escape hatch the model can return when the source is too
  thin. Add new banned phrases there as drift surfaces.

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
- `rl:dm:<user_id>:<bucket>` — DM rate limit, 30/hr sliding window.
- `rl:grp:<chat_id>:<bucket>` — group + guest cooldown, 6/min per chat.
- `userlookup:<tg_id>` — user row cache; 5-minute TTL.
- `setlist:<token>` — short-lived ID for combined-PDF callback (24h TTL).
- `resolve:<scope>` — in-flight multi-song resolution (parsed items, picks so
  far, current candidates) so a button tap or numeric reply can resume a
  half-built setlist (10-min TTL). Scope is `dm:<user_id>`,
  `grp:<chat_id>:<user_id>`, or `guest:<caller_id>`. See `resolver.js`.
- `state:last_digest_at` — debounces digest cron.

No long-lived photo cache. The guest-photo flow re-stages on every
request and deletes the staging message after — see `src/mediaCache.js`
for why (instant freshness on lyric/chord edits, no KV write per
request).

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
| DM rate limit hit | "Whoa, slow down — try again in N min" reply. |
| Group rate limit hit | "Busy chat — try again in N s" reply, threaded to the mention. |
| Setlist with no matches | "I couldn't read that. Try a title like ..." |
| pdfium loadDocument / render throws | Warn to log, return null, fall back to PDF. |
| Workers AI binding missing / call fails | `feature.js` posts the raw (escaped, truncated) PR body instead of an AI rewrite. Never silently drops an announcement. |
| AI returns `SKIP` | Treated as "source too thin" — falls back to raw body (which is already gated on non-empty by the workflow). |
| `MEDIA_STAGING_CHAT_ID` unset | Guest photo path throws; handler falls back to a text reply with `caption\nOpen the chart: <song page URL>`. |
| Staging chat upload rejected | Same text fallback. Common cause: bot lacks Post Messages permission on the staging chat. |
| `answerGuestQuery` rejects the photo result | Falls back to the text reply. The 400 response is logged verbatim so the next iteration can fix the `result` shape. |
| Staging `deleteMessage` fails | Logged at warn level; doesn't affect the reply the recipient saw. The staging chat may accumulate one message until the next manual cleanup. |

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
- **`update.guest_message` is its own top-level field**, not nested
  inside `update.message`. The webhook handler aliases it but downstream
  code that expects `message.from`/`message.message_id` should also read
  the extra fields `guest_query_id`, `guest_bot_caller_user`, and
  `guest_bot_caller_chat`.
- **`answerGuestQuery` is undocumented in the public Bot API at time
  of writing**. The accepted shape (a single `result` field with an
  `InlineQueryResult`-style object) was discovered empirically. If
  Telegram publishes the schema and it differs, fix `src/telegram.js`
  first — every other guest-mode breakage downstream traces back here.
- **Inline Mode interferes with group `@`-mentions**. If BotFather has
  Inline Mode → On, typing `@gracechords_bot ` (with a trailing space)
  in any chat is intercepted as an inline query and shows a "Search…"
  spinner instead of sending a normal message. The bot uses regular
  mentions, not inline queries — keep Inline Mode **off**.
- **file_ids survive their source message being deleted**. The guest
  flow relies on this: we stage a photo to capture the file_id, ship
  the reply, then `deleteMessage` the staging message. The recipient's
  copy keeps working because Telegram retains the underlying file.
- **`sendMediaGroup` does not accept `reply_markup`**. That's why
  setlists send each chart as an individual `sendPhoto` with the
  inline button on the last one. Don't reach for `sendMediaGroup` if
  the message needs a button on it.
- **The feature-post workflow filters by `feat(` prefix by default**.
  `chore`, `fix`, `refactor`, etc. only post when explicitly marked
  with the `post` label or `#post` in the title/body. If a real
  user-facing change ships under `fix(` the author has to opt in.

## Where to add things

| Change | File |
|---|---|
| New text command (e.g., `/about`) | `src/webhook.js`, before the free-text handler. Mirror the DM/group/guest split if the command should respond differently per surface. |
| New inline button | `src/webhook.js` callback handler + the place that sends the button. Keep `callback_data` under 64 bytes; stash via BOT_KV if longer. |
| New site API endpoint | `src/searchClient.js` (worker side) + `functions/api/bot/<name>.js` (site side) |
| Change rendering output | `src/pdfRender.js` |
| Change DM rate limit | `src/ratelimit.js` |
| Change group/guest cooldown | `src/groupRateLimit.js` |
| Tweak AI feature-post tone | `src/aiSummary.js` system prompt (banned phrases list). |
| Change feature-post trigger logic | `.github/workflows/feature-post.yml` `if:` clause + the title cleaning sed line. |
| Adjust guest-chat reply copy | `src/webhook.js` `handleGuestMessage`. Photo path always tries first; text fallback ships otherwise. |
| Add a digest content type | `src/digest.js` + Supabase query |
| Add a secret | `wrangler secret put …` AND document in `README.md` *and* the secrets comment block at the top of `wrangler.toml`. |
| Bigger bundle | Check `npm run dry-run` first |

## Related references

- `README.md` — provisioning, secrets, local dev, guest-chat setup.
- `../../src/utils/pdf_mvp/pure.js` — shared PDF engine.
- `../../src/utils/chordpro/parser.ts` — ChordPro parser (used by site
  and bot).
- `../../src/utils/chordpro/index.js` — `stepsBetween`,
  `transposeSymPrefer`.
- `../../functions/api/bot/*` — site-side bot API.
- `../../functions/api/telegram/link.js` — Telegram Login Widget linking.
- `../../.github/workflows/feature-post.yml` — feature post trigger
  (`feat(` prefix / `post` label / `#post` marker).
- [Telegram Bot API changelog](https://core.telegram.org/bots/api-changelog)
  — Guest Chat Mode entries (`update.guest_message`,
  `answerGuestQuery`, `SentGuestMessage`) added 2026.
