# @gracechords/web — Agent Guidance

Web sub-doc. The repo-root [`AGENTS.md`](../../AGENTS.md) is the single source of
truth for **monorepo-wide** conventions (shared core, RBAC single source of
truth, Supabase auth model, commit/branch style, general AI principles). Read it
first. This file covers everything **specific to the web app**.

Paths in this file are relative to `apps/web/` unless prefixed. `src/` means
`apps/web/src/`. Repo-root dirs are written with `../../` (e.g. `../../packages/core`,
`../../supabase`, `../../workers`).

## Project structure

- `src/` — React app (route-first layout; see [`src/README.md`](src/README.md)).
  - `src/pages/` — route-level screens (`*Page.jsx`). `AdminPage.jsx` (admin portal), `EditorPage.jsx` (editor portal).
  - `src/features/` — feature-internal modules (e.g. `features/readings/` for Daily Word).
  - `src/components/` — reusable cross-route UI. `components/auth/RoleGuard.jsx` gates routes by minimum role.
  - `src/components/ui/layout-kit/` — reusable UI primitives (`gc-*` classes).
  - `src/components/ui/mobile/` — mobile-responsive primitives for the **web** UI (`MobileActionSheet`, `MobileDock`, `MobilePaneTabs`, `MobileSheet`). Distinct from the native app.
  - `src/hooks/useAuth.jsx` — auth context: `session`, `user`, `profile`, `role`, `hasMinRole(minRole)`, `isOwner`, `isAdmin`, `isEditorRole`, `isCollaborator`.
  - `src/lib/supabase.js` — the **web** Supabase client (thin wrapper over `@gracechords/core`'s `createGcSupabase`, injecting Vite env + `cookieStorage`). Import this singleton everywhere; never create a second client.
  - `src/utils/` — pure utilities grouped by domain (`app`, `network`, `songs`, `setlists`, `media`, `content`, `archive`, `chordpro`, `pdf`, `pdf_mvp`).
  - `src/utils/chordpro/` — re-export **shims**; the real parser/serializer/normalization live in `../../packages/core/src/chordpro/`. `disclaimer.ts` stays here (depends on web config).
  - `src/i18n/` — UI translations (see [i18n](#internationalization-i18n)).
  - `src/data/resources.json` — generated posts index (legacy static fallback); do not hand-edit.
  - `src/assets/fonts/` — PDF fonts (Noto Sans/Mono). Must exist locally for PDF export.
  - `src/styles/index.css` — global style entry; imports `@gracechords/tokens/tokens.css`.
- `public/` — static assets: `wiki/` (wiki source), `bible/` (translation manifest + chapter JSON), `fonts/` (UI fonts), `resources/`, `pptx/`.
- `functions/` — Cloudflare Pages Functions (`bible/[[path]].js`, `pptx/[[path]].js`, `api/*`). They run server-side at the CF root directory (`apps/web`).
- `scripts/` — maintenance tasks (SEO/sitemap generation, Bible ingest, wiki sync, i18n check, ChordPro conversion).
- `index.html` / `404.html` — SPA entry + deep-link fallback.
- `dist/` — Vite build output (gitignored, deployed to Cloudflare Pages). **Never hand-edit.**

> Repo-root-owned by the monorepo, not this app: `../../packages/`, `../../supabase/migrations/`, `../../workers/`, and `.env.example` / `.env` (the web build reads `.env` from the repo root via Vite's `envDir`).

## Build, test & dev commands

Run from the repo root (delegates via `-w @gracechords/web`) or from inside `apps/web/`.

- `npm ci` — install exact dependencies (from the repo root).
- `npm run dev` — Vite dev server (http://localhost:5173).
- `npm run build` — Vite build + `generate-seo-pages.mjs` + `generate-sitemap.mjs` → **`dist/`** (i.e. `apps/web/dist/`).
- `npm run preview` — preview the production build.
- `npm test` / `npm run test:watch` / `npm run test:run` — Vitest (happy-dom + Testing Library).
- `npm run test:mvp` — PDF MVP engine safeguards.
- `npm run lint` — ESLint flat config (`eslint.config.js`).
- `npm run generate:sitemap` — regenerate `public/sitemap.xml`.
- `npm run build:bible -- --xml ./BIBLE_XML/File.xml` — ingest Bible XML → `public/bible/<lang>/<id>/`.
- `npm run i18n:check` — locale key-parity smoke check.

Pass `VITE_COMMIT_SHA=$(git rev-parse HEAD)` on production builds to bust the service-worker cache.

### Known baselines
- **Tests:** the suite is fully green (`npm test` should report zero failures). Any failure is a real regression — investigate, don't wave it through. Do **not** reintroduce a "failures expected" baseline. (History: an older "2 setcode + 11 supabase-load" baseline no longer applies — the vitest config injects `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and the client moved behind `createGcSupabase`.)
- **Lint:** clean — 0 warnings, 0 errors. Fix new `react-hooks/exhaustive-deps` warnings as you introduce them.

## Coding style & naming
- 2-space indent; single quotes; prefer no semicolons (match existing files).
- React components `PascalCase.jsx`; utilities `camelCase.js/ts`.
- Tests under `__tests__/` next to code, named `*.test.(js|jsx|ts)` or `*.spec.*`. Prefer accessible queries (`getByRole`, `getByLabelText`) over `data-testid`. Keep tests deterministic — no real network, no timers.
- Song/PPTX asset filenames stay lowercase with underscores (see the `normalize` script).
- ESLint flat config at `eslint.config.js`; `js.configs.recommended` is intentionally off. Add new rules sparingly so the hook signal stays loud.

## Design system (tokens + layout kit)
- **Tokens** live in `../../packages/tokens/tokens.css` (the warm-brown `--gc-*` palette), imported via `src/styles/index.css`. Always use `--gc-*` tokens for colors, spacing, radii, type scale, and motion. **Never** introduce hardcoded hex values, `px` sizes, or timing literals.
- Light/dark theming scopes token overrides under `[data-theme="dark"]`. `applyTheme()`/`toggleTheme()` in `src/utils/app/theme.js` set the attribute on `<html>` and persist to `localStorage`.
- **Layout kit** primitives live in `src/components/ui/layout-kit/`: `Button`, `Card`, `InsetCard`, `Chip`, `Field`, `IconButton`, `PageHeader`, `Panel`, `SegmentedControl`, `Toolbar`, `Input`, `SongCard`. Prefer these for all new UI; don't add one-off styled wrappers unless the kit genuinely can't express it.
- Legacy back-compat classes (`.btn`, `.card`, `.iconbtn`, `.container`) remain stable and map to kit styles via aliases in `src/styles.css`. Do not remove them.
- **Icons** are centralized in `src/components/Icons.jsx`. Add new icons there; never inline `<svg>` in page/component files.

## Mobile & responsive (web)
- Use `useIsMobile()` (`src/hooks/useIsMobile.js`) to branch layout logic; don't rely on CSS-only breakpoints for behavioral differences.
- On mobile, consolidate download/export actions into `MobileActionSheet` rather than adding individual buttons.

## Supabase (web)
- Import the singleton `src/lib/supabase.js` — never call `createClient` directly.
- Auth context: `src/hooks/useAuth.jsx`. Use `hasMinRole(minRole)` (or `useRole().isAtLeast`) for gate checks; never hardcode role strings unless adding a new role.
- Role hierarchy comes from `../../packages/core/src/rbac/roles.js` (re-exported via the `src/lib/roles.js` shim). See root AGENTS for the shared-core rule.
- RLS is on every table — test query changes with a `user`-role account before shipping.
- Migrations live in `../../supabase/migrations/` — apply in order; document impact in the PR.
- `SUPABASE_SERVICE_ROLE_KEY` is used **only** by Node build scripts (`generate-seo-pages.mjs`, `generate-sitemap.mjs`). Never bundle it into the frontend.

## Data flow & search
- Songs and posts are served directly from Supabase at runtime (`useSongs.jsx`, `usePosts.jsx`), cached per session; `SongsPage` feeds results to Fuse.js for in-memory fuzzy search. There is no required local JSON index.
- Build-time SEO: `generate-seo-pages.mjs` emits static HTML shells for `/songs/:id` and `/resources/:slug`; `generate-sitemap.mjs` writes `public/sitemap.xml`. Both need `SUPABASE_SERVICE_ROLE_KEY`.
- Sorting: numeric titles first; otherwise case-insensitive, ignoring leading punctuation (`'Tis` sorts under `T`); translation-aware (selected-language variants first). Songs group by `song_id`.

## PDF engine
- Engine: `src/utils/pdf_mvp/` — jsPDF-based, the **only** PDF stack. Call `downloadSingleSongPdf()`, `downloadMultiSongPdf()`, `downloadSongbookPdf()` from UI code.
- Decision ladder: 1-col single page (16→12 pt) → 2-col single page (16→12 pt) → 1-col multipage (15 pt).
- Type scale (do not regress): Title 26 pt bold; Key 16 pt italic gray; lyrics/chords 12–16 pt with ~1.2× line-height; sections atomic (never split across columns/pages).
- Tests: `npm run test:mvp`. Never modify the engine without running these. Full constants in `src/utils/pdf_mvp/README.md`.

## JPG / image exporter
- Renderer: `src/utils/media/image.js` (Canvas2D). Planner: `src/utils/media/jpgPlanner.js` (Canvas2D layout — used **only** by the JPG exporter, not a PDF engine). Fonts: `src/utils/media/canvasFonts.js`.

## Service worker
- `src/sw.js`, registered in `src/main.jsx`. Network-first for navigations + the legacy `/src/data/*` fallback; stale-while-revalidate for other static assets. Songs live in Supabase, so the SW never touches them.
- Cache name includes `VITE_COMMIT_SHA` so every deploy invalidates old caches. Always pass it on production builds.

## Cloudflare
- **Pages:** hosts the SPA via CF's Git integration. Monorepo deploy settings (root directory `apps/web`, workspace-aware build command, output `dist/` → `apps/web/dist`) and rationale are in [`MONOREPO_MIGRATION.md`](../../MONOREPO_MIGRATION.md). All `VITE_*` production vars are set in Pages → Settings → Variables — don't change them without coordinating a deploy.
- **Pages Functions** (`functions/`): `bible/[[path]].js` and `pptx/[[path]].js` proxy R2 assets server-side to avoid CORS; `api/*` for server-side endpoints (e.g. Telegram push). They sit at the CF root directory (`apps/web`), which is why `functions/` moved with the app.
- **R2** (`gracechords-bible`, base URL `VITE_R2_PUBLIC_URL`): `pptx/<slug>.pptx` for decks, `bible/<lang>/<id>/` for chapter JSON. In dev, Vite proxies `/bible` and `/pptx`. Never call R2 directly from the browser — upload/delete goes through the pptx-upload Worker.
- **Workers** (`../../workers/`, deployed independently with `wrangler deploy`): `gracechords-pptx-upload` (authenticated PPTX upload/delete — verifies Supabase JWT, checks role, writes to R2), `gracechords-sitemap-rebuild` (Sunday 00:00 UTC cron), `gracechords-telegram-bot` (`@gracechords_bot`; see `../../workers/telegram-bot/ARCHITECTURE.md`).

## Public reflections moderation (backend — Phase 2A)
- **Public reflections can only enter the DB after passing moderation.** The reflections `own_insert` RLS policy is private-only, so a `visibility='public'` row is written **exclusively** by the service-role Pages Function `functions/api/reflections/submit.js` — there is no client-facing public-insert policy, which guarantees moderation always runs. 2A ships **no client UI** (compose/feed/hearts/report are Phase 2B); the endpoints exist for 2B to call.
- **Moderation pipeline** (`functions/api/reflections/_moderation.js`, unit-tested): `moderateText(body, env)` → Layer 1 local (URL/blocklist/length, `_blocklist.js`) runs first and short-circuits before any API call; Layer 2 OpenAI `omni-moderation-latest` via `OPENAI_API_KEY`. **Fails closed** — an API error throws `ModerationUnavailable` → submit returns 503, never inserts. Providers sit behind a registry so a second provider (Gemini) is config, not a rewrite.
- **Kill switch + moderation state** live in migration `20260719000100_public_reflections_backend.sql`: `feature_flags` (`public_reflections`, default **off** — since **enabled** by migration `20260719000300_enable_public_reflections.sql`; flip the row to `false` in the Supabase dashboard to take it back down), `banned_users`, `reports`, `reflection_hearts` (+ `heart_count` trigger), and `reflections.removed_at/removed_reason`. The public-feed read policy is gated today-only + not-removed + not-banned + feature-on, via SECURITY DEFINER helpers `is_user_banned` / `feature_enabled` (needed because `banned_users` has no client select). **Admin acts in the Supabase dashboard**: set `removed_at`/`removed_reason` to hide a post; insert a `banned_users` row to eject an author (hides all their posts + blocks new ones).
- **Report alert** (`functions/api/reflections/report.js` → bot worker `/internal/report-alert`) fires a Telegram message to `DEV_CHANNEL_ID` with the reflection_id, author user_id, date, reason, and body preview. Reuses `BOT_INTERNAL_URL`/`BOT_WEBHOOK_TOKEN`.

## Cloudinary
- Unsigned browser uploads via `VITE_CLOUDINARY_CLOUD_NAME` + `VITE_CLOUDINARY_UPLOAD_PRESET`. No server-side SDK — all uploads are direct from the browser. Returned URLs go into `songs.featured_image_url` / `posts.featured_image_url`. Follow the existing song/post editor pattern to add uploads elsewhere.

## Resend
- Transactional email. `RESEND_API_KEY` is **server-side only** — never expose it to the Vite bundle. Add new email triggers in a Worker/Pages Function, never in frontend code.

## GraceTracks
- Songs optionally link practice stem tracks via `has_stems` (bool), `stem_slug` (text), `gracetracks_url` (text) on `public.songs`. Check `has_stems` before showing any GraceTracks affordance.

## Environment variables
- Production values live in **Cloudflare Pages → Settings → Variables** — don't add/change/remove them. The full list is in [`.env.example`](../../.env.example).
- Local dev: copy `.env.example` → `.env` at the **repo root**. Never commit `.env`.
- Any new `VITE_*` var must be added to `.env.example` (placeholder + one-line description) in the same commit it is introduced.
- Server-side vars (`RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Worker secrets) must never appear in Vite-bundled code.
- New Supabase tables must have RLS enabled with policies before merging.

## Internationalization (i18n)
UI translations live under `src/i18n/locales/{lang}/` across ten namespaces
(`admin`, `auth`, `common`, `editor`, `errors`, `home`, `nav`, `profile`,
`setlist`, `song`). The English files (`src/i18n/locales/en/`) are the **source of
truth**; every other locale mirrors their key shape. Runtime wiring is in
`src/i18n/index.js` and `src/hooks/useLocale.jsx`; the supported list is in
`src/i18n/config.js`. Tooling lives at `../../gracechords-i18n/` (`SKILL.md`,
`scripts/validate.py`, `glossaries/{lang}.md`).

### Workflow when English strings change
1. Apply the same key change to every other locale folder.
2. For each non-English file modified, set `_meta.needsReview` to `true` and clear `_meta.reviewer` / `_meta.reviewedAt` to empty strings.
3. Follow `../../gracechords-i18n/SKILL.md` for translation guidance; consult `glossaries/{lang}.md` for terminology (append new terms there).
4. Run the validator per non-English locale (`python ../../gracechords-i18n/scripts/validate.py src/i18n/locales/en src/i18n/locales/{lang}`); exit `0` is clean. `npm run i18n:check` is a faster parity smoke pass.

### Hard rules
- **Never** modify a file where `_meta.needsReview` is `false` without explicit instruction — that value is a human reviewer's signoff.
- **Never** change JSON keys, HTML tags, or `{{variables}}` — byte-identical across all locales.
- **Never** translate the brand name "GraceChords."
- **Never** populate `_meta.reviewer` or `_meta.reviewedAt` — humans fill those after QA.
- **Always** run the validator before committing locale changes.
- Each file starts with an inline single-line `_meta` block — preserve that format. 2-space indent, trailing newline, matching source key order.

## Web-specific AI rules
- When adding a route: register it in `src/App.jsx`, add the page under `src/pages/`, and protect it with `RoleGuard` if it needs a minimum role.
- When adding a Supabase table: provide the migration SQL in `../../supabase/migrations/` with RLS policies, and update `.env.example` if new env vars are needed.
- Never hand-edit `dist/` or generated data (`src/data/*.json`).
- After UI changes: run the dev server, exercise the golden path, and check adjacent features for regressions before calling the task done.
- Run `npm test` and `npm run build` before pushing; both must pass at the documented baselines.

## Repo gotchas
- **esbuild platform-binary drift:** a fresh `npm install` can leave `node_modules/esbuild` and `node_modules/@esbuild/linux-x64` at mismatched versions (`Host version "…" does not match binary version "…"` on `test:run`/`vite build`). Recover with `rm -rf node_modules/@esbuild/linux-x64 && npm install --no-save`.
- **CI (`.github/workflows/pr-checks.yml`)** runs lint/test/build on every PR with `continue-on-error: true` — it's signal, not a gate. Don't expect CI to block on warnings.
