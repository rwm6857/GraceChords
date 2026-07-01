Understand where things live in the codebase and what each folder provides.

GraceChords is an **npm-workspaces monorepo**. Shared, platform-agnostic logic
lives in `packages/`; the web and mobile apps consume it.

## Top-level layout

```
apps/
  web/            @gracechords/web    — React + Vite SPA (the production site)
  mobile/         @gracechords/mobile — Expo / React Native iOS app
packages/
  core/           @gracechords/core   — shared, DOM-free logic (ChordPro parser,
                                         transposition, RBAC, setlist codec, Supabase factory)
  tokens/         @gracechords/tokens — design tokens (web CSS + native TS map)
workers/          Cloudflare Workers (PPTX upload, sitemap rebuild, Telegram bot)
supabase/         SQL migrations
gc-ios-design-reference/   iOS design handoff bundle (mobile UI source of truth)
```

Run web tasks from the repo root (`npm run dev`, `build`, `test`, `lint` delegate
to `-w @gracechords/web`) or from inside `apps/web/`.

## `apps/web/`
The production single-page app.

- `src/pages/` — route-level screens (Home, SongView, Setlist builder, Songbook builder, Resources, Worship Mode, Editor Portal, Admin Portal, Daily Word)
- `src/components/auth/RoleGuard.jsx` — route guard; redirects users lacking the required role
- `src/hooks/useAuth.jsx` — auth context (`role`, `hasMinRole`, `isOwner`, …)
- `src/hooks/useSongs.jsx` — fetches the song catalog from Supabase (session cache)
- `src/hooks/usePosts.jsx` — CRUD helpers for the Supabase `posts` table
- `src/lib/supabase.js` — web Supabase client (thin wrapper over `@gracechords/core`'s factory)
- `src/utils/setlists/supabaseSets.js` — Supabase-backed saved-set operations
- `src/utils/pdf_mvp/` — single-song PDF engine with tests and font registrar
- `src/utils/media/` — Canvas2D JPG exporter
- `src/utils/chordpro/` — re-export shims; the real parser lives in `packages/core`
- `src/components/ui/layout-kit/` — reusable UI primitives (Card, Toolbar, Chip, …)
- `src/features/readings/` — Daily Word (M'Cheyne plan + Bible loader)
- `src/i18n/` — UI translations (en, tr, ar, es)
- `public/` — static assets: `wiki/` (this wiki's source), `bible/` (translations manifest + chapter JSON), `fonts/` (UI fonts), `pptx/`, `resources/`, `sitemap.xml`, `robots.txt`
- `functions/` — Cloudflare Pages Functions (`bible/`, `pptx/`, `api/` proxies)
- `scripts/` — SEO/sitemap generation, Bible ingest, wiki sync, i18n check, ChordPro conversion
- `dist/` — Vite build output for Cloudflare Pages (gitignored, generated)

**Songs and posts live in Supabase, not in `public/`.** Styling uses the `--gc-*`
tokens from `packages/tokens/tokens.css` (imported via `src/styles/index.css`).

## `apps/mobile/`
The native iOS client — a themed four-tab shell with the Song Library and Home
screens, built on the shared core. See [[Mobile-App]] for details.

## `packages/core/` (`@gracechords/core`)
Pure TypeScript/JS shared by both apps, consumed as source with no build step:
the ChordPro **parser** (not the renderer), transposition, chord placement, song
metadata/sort, the setlist codec, the role hierarchy (`rbac/roles.js` — the single
source of truth for `hasMinRole()`), and the Supabase client **factory**.

## `packages/tokens/` (`@gracechords/tokens`)
Design tokens for both platforms — web imports `tokens.css`; React Native imports
the typed map from `@gracechords/tokens/native`.

## `supabase/`
SQL migrations applied in order — `users`, `songs`, `posts`, `user_starred_songs`,
`saved_sets`, `collaborator_requests`. Every table has row-level security.

## `workers/`
Standalone Cloudflare Workers, each deployed with `wrangler deploy`:
- `pptx-upload/` — authenticated PPTX upload/delete to R2 (validates Supabase JWT + role)
- `sitemap-rebuild/` — weekly cron to rebuild the sitemap
- `telegram-bot/` — powers `@gracechords_bot` (see `workers/telegram-bot/ARCHITECTURE.md`)

[[Index-Building]] [[UI-Design-System]] [[Roles-and-Access]] [[Cloudflare-Infrastructure]] [[Mobile-App]]
