# @gracechords/web — Agent Rules

Web-specific rules; monorepo-wide rules (core, tokens, roles, RLS, migrations,
env vars, commits) are in the root [`AGENTS.md`](../../AGENTS.md). Paths here are
relative to `apps/web/`; `../../` means the repo root.

## Structure
- `src/` — React app, route-first (see [`src/README.md`](src/README.md)).
  - `pages/` route screens (`*Page.jsx`, incl. `AdminPage`, `EditorPage`); `features/` feature modules; `components/` shared UI.
  - `components/auth/RoleGuard.jsx` gates routes by minimum role.
  - `components/ui/layout-kit/` — UI primitives (`gc-*` classes). `components/ui/mobile/` — responsive primitives for the **web** UI (`MobileActionSheet`, `MobileDock`, `MobilePaneTabs`, `MobileSheet`), unrelated to the native app.
  - `hooks/useAuth.jsx` — auth context (`session`, `user`, `profile`, `role`, `hasMinRole()`, `isOwner`, `isAdmin`, `isEditorRole`).
  - `lib/supabase.js` — the **only** web Supabase client (wraps core's `createGcSupabase`). Never call `createClient`.
  - `utils/` — pure utilities by domain. `utils/chordpro/` and `lib/roles.js` are shims over core.
  - `assets/fonts/` — Noto fonts required for PDF export.
- `public/` — static assets incl. `wiki/` (wiki source), `bible/`, `.well-known/` (deep-link claims — see its README).
- `functions/` — Cloudflare Pages Functions (`bible/`, `pptx/` R2 proxies; `api/*` endpoints).
- `scripts/` — SEO/sitemap, Bible ingest, wiki sync, i18n check.
- `dist/` and generated data (`src/data/*.json`) — **never hand-edit.**

## Commands
Run from the repo root or `apps/web/`.
- `npm run dev` (http://localhost:5173) · `npm run build` (Vite + SEO pages + sitemap → `dist/`) · `npm run preview`
- `npm test` / `test:run` / `test:watch` — Vitest (happy-dom + Testing Library)
- `npm run test:mvp` — PDF engine safeguards · `npm run lint` · `npm run i18n:check`
- `npm run build:bible -- --xml ./BIBLE_XML/File.xml` — ingest Bible XML
- Production builds pass `VITE_COMMIT_SHA=$(git rev-parse HEAD)` (busts the service-worker cache).

**Before pushing:** `npm test`, `npm run lint`, and `npm run build` must all be
clean — the suite has zero expected failures and lint has zero warnings, so any
failure is a real regression. After UI changes, run the dev server and exercise
the golden path plus adjacent features.

CI (`.github/workflows/pr-checks.yml`) runs lint/test/build with
`continue-on-error: true` — it is signal, not a gate.

## Style
- 2-space indent, single quotes, no semicolons (match existing files).
- Components `PascalCase.jsx`; utilities `camelCase.js/ts`.
- Tests in `__tests__/` beside the code (`*.test.*`). Prefer `getByRole`/`getByLabelText` over `data-testid`; no real network or timers.
- ESLint flat config; `js.configs.recommended` is intentionally off. Add rules sparingly. Fix new `react-hooks/exhaustive-deps` warnings as you introduce them.
- Song/PPTX asset filenames: lowercase with underscores.

## Design system
- Use `--gc-*` tokens (`../../packages/tokens/tokens.css`, Signal Blue palette) for color, spacing, radii, type, and motion. **No** hardcoded hex, `px`, or timing literals.
- Dark mode overrides live under `[data-theme="dark"]`, set by `src/utils/app/theme.js`.
- Build new UI from the layout kit (`Button`, `Card`, `InsetCard`, `Chip`, `Field`, `IconButton`, `PageHeader`, `Panel`, `SegmentedControl`, `Toolbar`, `Input`, `SongCard`). Keep the legacy `.btn`/`.card`/`.iconbtn`/`.container` aliases in `src/styles/base.css`.
- Icons go in `src/components/Icons.jsx`; never inline `<svg>` elsewhere.
- Responsive behavior branches on `useIsMobile()`, not CSS-only breakpoints. On mobile, export/download actions go in `MobileActionSheet`.

## Adding things
- **Route:** register in `src/App.jsx`, page in `src/pages/`, wrap in `RoleGuard` if it needs a role.
- **Supabase table:** migration in `../../supabase/migrations/` with RLS policies (see root rules).
- **Email:** Resend runs server-side only (Worker or Pages Function), never in frontend code.
- **Image upload:** Cloudinary unsigned browser uploads (`VITE_CLOUDINARY_*`); follow the song/post editor pattern. URLs go in `*.featured_image_url`.
- **GraceTracks:** check `songs.has_stems` before showing any affordance (`stem_slug`, `gracetracks_url`).

## Data, SEO & build output
- Songs and posts load from Supabase at runtime (`useSongs`, `usePosts`); search is an in-memory word-prefix match (`src/utils/songs/search.js`).
- Sorting: numeric titles first, then case-insensitive ignoring leading punctuation (`'Tis` → T). Translation grouping (`song_group_id`, language variants) exists in code but is not wired to data yet.
- `generate-seo-pages.mjs` emits static shells for `/songs/:id`, `/posts/:slug`, and pre-renders `/privacy`, `/terms`, `/delete-account`. **A route with no file in `dist/` is served as `404.html` with HTTP 404**, so any URL external systems check (e.g. Google Play's privacy/deletion links) must be emitted here. Both generators need `SUPABASE_SERVICE_ROLE_KEY`.

## PDF & image export
- `src/utils/pdf_mvp/` (jsPDF) is the **only** PDF engine; UI calls `downloadSingleSongPdf()`, `downloadMultiSongPdf()`, `downloadSongbookPdf()`.
- Layout ladder: 1-col single page (16→12 pt) → 2-col single page (16→12 pt) → 1-col multipage (15 pt). Don't regress the type scale (title 26 pt bold, key 16 pt italic gray, lyrics/chords 12–16 pt). Sections never split across columns/pages.
- Never change the engine without `npm run test:mvp`. Constants: `src/utils/pdf_mvp/README.md`.
- JPG export: `src/utils/media/image.js` (Canvas2D) + `jpgPlanner.js` (JPG-only layout).

## Service worker
`src/sw.js`: network-first for navigations (and the legacy `/src/data/index.json`),
cache-first for other static assets; never touches song data. The cache name includes `VITE_COMMIT_SHA`.

## Cloudflare
- **Pages** root directory is `apps/web`. `VITE_*` production vars are coordinated with deploys — don't change them.
- **R2** (`VITE_R2_PUBLIC_URL`): `pptx/<slug>.pptx`, `bible/<lang>/<id>/`. Never call R2 from the browser; reads go through the `functions/` proxies (Vite proxies them in dev), writes through the `pptx-upload` Worker.
- **Workers** (`../../workers/`, `wrangler deploy`): `pptx-upload` (JWT + role check → R2), `sitemap-rebuild` (Sunday cron), `telegram-bot`, `session-cleanup`.
- `functions/api/reflections/` is a **retired** feature that stays deployed on purpose — read its README before touching it or building any public user-generated content.

## Internationalization
Locales: `src/i18n/locales/{lang}/<namespace>.json`; `en/` is the source of
truth and every locale mirrors its keys. Supported list: `src/i18n/config.js`.
Translation guidance ships as the `gracechords-i18n` agent skill.

When English strings change:
1. Apply the same key change to every locale.
2. In each non-English file you modify, set `_meta.needsReview: true` and clear `_meta.reviewer` / `_meta.reviewedAt` to `""`.
3. Use the `gracechords-i18n` skill for translations and terminology.
4. Run `npm run i18n:check` (exits non-zero on key drift) before committing.

Hard rules:
- **Never** edit a file whose `_meta.needsReview` is `false` without explicit instruction — that is a human reviewer's sign-off.
- **Never** change keys, HTML tags, or `{{variables}}`; never translate "GraceChords"; never fill `_meta.reviewer`/`reviewedAt`.
- Keep the single-line `_meta` block, 2-space indent, trailing newline, and source key order.

## Gotcha
esbuild binary drift after a fresh install (`Host version "…" does not match binary version "…"`): `rm -rf node_modules/@esbuild/linux-x64 && npm install --no-save`.
