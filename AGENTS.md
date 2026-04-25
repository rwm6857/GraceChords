# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React app (components, pages, utils, styles, tests).
  - `src/pages/AdminPage.jsx` — Admin Portal (user/role management); requires `admin` role via `RoleGuard`
  - `src/pages/EditorPage.jsx` — Editor Portal landing page; requires `editor` role
  - `src/components/auth/RoleGuard.jsx` — redirects users lacking the required minimum role
  - `src/components/CollaboratorRequest.jsx` — collaborator access request UI for `user`-role accounts
  - `src/hooks/useAuth.jsx` — auth context: `role`, `hasMinRole(minRole)`, `isOwner`, `isAdmin`, `isEditorRole`, `isCollaborator`
  - `src/lib/supabase.js` — Supabase client
  - `src/utils/setlists/supabaseSets.js` — Supabase-backed saved set CRUD
  - `src/utils/pdf_mvp/` — PDF engine with tests and font registrar
  - `src/utils/pdf/` — facade and multi-song/songbook exports
  - `src/utils/chordpro/` — parser, serializer, normalization, helpers
  - `src/data/index.json` — generated song index (legacy static fallback); do not hand-edit
  - `src/styles/tokens.css` — `--gc-*` design tokens (light/dark, spacing, type scale)
  - `src/styles/admin-portal.css` — Admin/Editor portal styles
  - `src/components/ui/layout-kit/` — reusable UI primitives (Card, Toolbar, Chip, etc.)
- `public/`: static assets — `resources/` for blog posts, `wiki/` as wiki source, `bible/` for translation manifest + chapter JSON, `fonts/` for UI fonts. **Songs are in Supabase, not `public/songs/`.**
- `supabase/migrations/`: SQL migrations — apply in order for `users`, `songs`, `user_starred_songs`, `saved_sets`, `collaborator_requests` tables.
- `scripts/`: maintenance tasks (index build, filename normalization, wiki sync, ingest CLI).
- `docs/`: Vite build output for GitHub Pages. Do not edit by hand.

## Supabase & Auth
- Supabase is used for auth, song storage, starred songs, saved sets, and collaborator requests.
- Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Role system: `user → collaborator → editor → admin → owner` (stored in `public.users.role`).
- Use `hasMinRole(minRole)` from `useAuth` for role checks; never hardcode role strings in conditionals unless adding a new role.
- RLS policies on all tables — test with a non-owner account before shipping.

## Build, Test, and Development Commands
- `npm ci`: install exact dependencies.
- `npm run dev`: start Vite dev server (http://localhost:5173).
- `npm run build`: produce static site into `docs/`.
- `npm run preview`: preview the production build locally.
- `npm run build-index`: generate `src/data/index.json` (legacy; songs now live in Supabase).
- `npm run build:esv`: generate `public/esv/<Book>/<Chapter>.json` from `ESV.xml` at repo root.
- `npm run normalize`: normalize song/PPTX filenames into canonical forms.
- `npm test` / `npm run test:watch`: run Vitest (happy-dom + Testing Library).
- `npm run test:mvp`: run PDF MVP engine safeguards.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; single quotes; prefer no semicolons (match existing files).
- React components: `PascalCase.jsx` (e.g., `SongView.jsx`). Utilities: `camelCase.js/ts`.
- Tests: place under `__tests__/` next to code; name `*.test.(js|jsx|ts)` or `*.spec.*`.
- Paths and assets: keep song files lowercase with underscores (see `normalize` script).

## UI Styling (UIKit Tokens + Layout Kit)
- Tokens live in `src/styles/tokens.css`. Always use the `--gc-*` tokens for colors, spacing, radii, and type scale.
- Legacy aliases in `src/styles.css` map older variables (e.g., `--primary`, `--card`) to tokens. Do not introduce new hardcoded hex values.
- Reusable UI primitives live in `src/components/ui/layout-kit/` with `gc-*` classnames and `layout-kit.css`.
- Prefer the layout kit components (Card, InsetCard, Toolbar, SegmentedControl, Chip, Field, IconButton, PageHeader) for new UI.
- Back-compat classes (`.btn`, `.card`, `.iconbtn`, `.container`) must remain stable and match the kit styling.

## Testing Guidelines
- Frameworks: Vitest + @testing-library/react, environment `happy-dom` (`src/setupTests.js`).
- Write unit tests for utilities and component behavior; prefer accessible queries over `data-testid`.
- Run full suite with `npm test`; target PDF layout with `npm run test:mvp`.
- Keep tests deterministic; avoid timers and real network.

## Commit & Pull Request Guidelines
- Commit style: conventional preferred — `type(scope): summary`.
  - Examples: `feat(admin): collaborator request queue`, `fix(pdf): prevent orphan lines`, `chore(index): rebuild`.
- PRs: include a clear description, linked issues, and screenshots/GIFs for UI changes. Note any data/index or Supabase migration impacts.
- Before opening: run `npm test`, `npm run build`, and (if schema changed) note which migrations to apply.
- Do not commit secrets or `.env`; do not hand-edit `docs/`.

## Environment Variables & Configuration
- **Production values are configured in Cloudflare Pages** (Settings → Variables and Secrets). Do not add, change, or remove production secrets — they are already set. The full list is documented in `.env.example`.
- Local dev: copy `.env.example` to `.env` and fill in your own values. Never commit `.env`.
- **Rule for agents/contributors:** any time a new environment variable is introduced anywhere in the codebase, `.env.example` must be updated in the same PR/commit with a placeholder value and a one-line description of what it does and where to find it.
- `VITE_COMMIT_SHA=$(git rev-parse HEAD)` during builds to bust service worker caches.
- Fonts for PDF export must exist in `src/assets/fonts/` (see README for list).
- New Supabase tables must have RLS enabled and appropriate policies before merging.

---

## Design System & Properties

### Token System
- All colours, spacing, radii, type scale, and motion values live in `src/styles/tokens.css`
  as `--gc-*` CSS custom properties. This file is the **single source of truth**.
- Never introduce hardcoded hex values, `px` sizes, or timing literals anywhere in
  component or page CSS. Always reference a token.
- Light/dark theming is handled by scoping token overrides under `[data-theme="dark"]` in
  `tokens.css`. The `applyTheme()` / `toggleTheme()` helpers in `src/utils/app/theme.js`
  set the `data-theme` attribute on `<html>` and persist the choice to `localStorage`.

### Layout Kit
- Reusable UI primitives live in `src/components/ui/layout-kit/`:
  `Button`, `Card`, `InsetCard`, `Chip`, `Field`, `IconButton`, `PageHeader`, `Panel`,
  `SegmentedControl`, `Toolbar`, `Input`, `SongCard`.
- Prefer these components for all new UI. Do not introduce new one-off styled wrappers
  unless the layout kit genuinely cannot express what is needed.
- Class names follow the `gc-*` prefix convention (`gc-card`, `gc-btn`, `gc-chip`, …).
- Legacy back-compat classes (`.btn`, `.card`, `.iconbtn`, `.container`) remain stable and
  map to kit styles via aliases in `src/styles.css`. Do not remove them.

### Mobile & Responsive
- Mobile-specific primitives: `MobileActionSheet`, `MobileDock`, `MobilePaneTabs`,
  `MobileSheet` in `src/components/ui/mobile/`.
- Use `useIsMobile()` (from `src/hooks/useIsMobile.js`) to branch layout logic; do not
  rely on CSS-only breakpoints for component-level behavioural differences.
- Action sheets (`MobileActionSheet`) replace dropdown menus and inline button rows on
  mobile. Consolidate download/export options there rather than adding individual buttons.

### Typography & PDF
- UI fonts: Inter Variable (loaded from `public/fonts/`).
- PDF fonts: NotoSans Regular/Bold/Italic/BoldItalic + NotoSansMono Regular/Bold
  (stored in `src/assets/fonts/`). These must exist locally for PDF generation.
- PDF type scale: Title 26 pt bold; section headers 16 pt; lyrics/chords 12–16 pt;
  line-height ~1.2×. See `src/utils/pdf_mvp/README.md` for full constants.

### Icons
- All SVG icons are centralised in `src/components/Icons.jsx`. Add new icons there;
  never inline `<svg>` directly in page or component files.

---

## Current Systems & Tools

### Supabase
- **Client:** `src/lib/supabase.js` — import this singleton everywhere; never create a
  second client.
- **Auth context:** `src/hooks/useAuth.jsx` — exposes `session`, `user`, `profile`,
  `role`, `hasMinRole(minRole)`, `isAdmin`, `isOwner`, `isEditorRole`, `isCollaborator`.
- **Role hierarchy:** `user → collaborator → editor → admin → owner`. Always use
  `hasMinRole()` for gate checks.
- **RLS:** all tables have row-level security. Test with a `user`-role account before
  shipping any query change.
- **Migrations:** `supabase/migrations/` — apply in order. Document migration impact in
  the PR description.
- **Service role:** `SUPABASE_SERVICE_ROLE_KEY` is used only by Node build scripts
  (`generate-seo-pages.mjs`, `generate-sitemap.mjs`). Never bundle it into the frontend.

### Cloudflare Pages
- SPA is hosted on Cloudflare Pages. Auto-deploy fires on every push to `main` via
  `.github/workflows/pages-deploy.yml`.
- All `VITE_*` production env vars are set in Pages → Settings → Variables — do not
  change them without coordinating a deploy.
- `functions/` contains Pages Functions (run server-side, no separate Worker deployment
  required): `bible/[[path]].js` and `pptx/[[path]].js` proxy R2 assets to avoid CORS.
- `404.html` + `BrowserRouter` together handle SPA deep-link routing.

### Cloudflare R2
- Bucket: `gracechords-bible`. Public base URL: `VITE_R2_PUBLIC_URL`.
- Paths: `pptx/<slug>.pptx` for slide decks; `bible/<lang>/<id>/` for chapter JSON.
- In local dev, Vite proxies `/bible` and `/pptx` to `VITE_R2_PUBLIC_URL`.
- Direct R2 access (upload/delete) goes through the `gracechords-pptx-upload` Worker —
  never call R2 directly from the browser.

### Cloudflare Workers
- **`gracechords-pptx-upload`** (`workers/pptx-upload/`) — handles authenticated PPTX
  upload/delete. Verifies Supabase JWT, checks role, writes/deletes from R2.
  Secrets: `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ALLOWED_ORIGINS`. Set via `wrangler secret put`.
- **`gracechords-sitemap-rebuild`** (`workers/sitemap-rebuild/`) — cron
  `0 0 * * 0` (Sunday 00:00 UTC) rebuilds `public/sitemap.xml`.
- Worker configs: `workers/*/wrangler.toml`. Deploy individually with `wrangler deploy`.

### Cloudinary
- Unsigned browser uploads via `VITE_CLOUDINARY_CLOUD_NAME` + `VITE_CLOUDINARY_UPLOAD_PRESET`.
- No server-side Cloudinary SDK. All uploads are direct from the browser.
- Returned URLs are stored in `songs.featured_image_url` and `posts.featured_image_url`.
- To add Cloudinary upload to a new feature, follow the pattern in the existing song/post
  editor components.

### Resend
- Used for transactional/notification emails.
- `RESEND_API_KEY` is **server-side only** — never expose it to the Vite bundle.
- Integration point: Cloudflare Worker or Supabase Edge Function. Check `workers/` for
  active send points.
- When adding a new email trigger, create or extend a Worker/Edge Function; do not add
  Resend calls to frontend code.

### PDF Engine
- Facade: `src/utils/pdf/index.js` — call `downloadSingleSongPdf()`,
  `downloadSongbookPdf()`, etc. from UI code.
- Engine: `src/utils/pdf_mvp/` — jsPDF-based MVP. Decision ladder: 1-col single page
  (sizes 16→12 pt) → 2-col single page (16→12 pt) → 1-col multipage (15 pt).
- Tests: `npm run test:mvp`. Never modify the engine without running these tests.

### Service Worker
- `src/sw.js` — registered in `src/main.jsx`.
- Strategy: network-first for `/songs` and `/index.html`; stale-while-revalidate for
  other static assets.
- Cache name includes `VITE_COMMIT_SHA` so every deploy invalidates old caches.
- Always pass `VITE_COMMIT_SHA=$(git rev-parse HEAD)` when building for production.

### GraceTracks Integration
- Songs optionally link to practice stem tracks via `has_stems` (boolean),
  `stem_slug` (text), and `gracetracks_url` (text) columns in `public.songs`.
- UI should check `has_stems` before showing any GraceTracks affordance.

---

## Claude Code — Agent Instructions

These are the conventions and patterns used by Claude Code (AI-assisted development) in
this repository. Follow them for all AI-generated changes.

### General Principles
- **Minimal diffs.** Fix what was asked; do not refactor surrounding code, add unrelated
  features, or introduce abstractions beyond what the task requires.
- **No speculative features.** Do not design for hypothetical future requirements.
  Three similar lines is better than a premature abstraction.
- **No unnecessary comments.** Only add a comment when the WHY is non-obvious: a hidden
  constraint, a subtle invariant, or a framework workaround. Never restate what the code
  already says.
- **Security first.** Never introduce command injection, XSS, SQL injection, or other
  OWASP Top 10 vulnerabilities. If insecure code is spotted, fix it immediately.
- **No half-finished implementations.** If a feature cannot be completed safely in the
  current change, leave the existing code intact and raise the gap explicitly.

### File & Scope Rules
- Prefer editing existing files over creating new ones.
- Never hand-edit `dist/`, `docs/`, or `src/data/index.json` (generated files).
- Never commit `.env` or any file containing secrets.
- When adding a new route, register it in `src/App.jsx` and add a corresponding page file
  under `src/pages/`. Protect it with `RoleGuard` if it requires a minimum role.
- When adding a new Supabase table, provide the migration SQL in `supabase/migrations/`
  with RLS policies, and update `.env.example` if new env vars are needed.

### UI Changes
- Use `--gc-*` tokens. Never hardcode colours, sizes, or timing.
- Use layout-kit primitives (`Card`, `Button`, `Chip`, etc.). Do not introduce new
  one-off styled wrappers without a strong reason.
- On mobile, consolidate actions into `MobileActionSheet`. Do not add individual buttons
  where an action sheet is already in use.
- After making UI changes: start the dev server, exercise the golden path, and check for
  regressions in adjacent features before marking the task complete.

### Branching & Commits
- Development branches follow the pattern `claude/<short-description>-<id>`.
- Commit style: Conventional Commits — `type(scope): summary`.
  Examples: `feat(setlist): team sharing`, `fix(pdf): orphan lines`, `chore: rebuild index`.
- Push to the feature branch; open a PR against `main`. Never push directly to `main`.
- Include screenshots or GIFs in the PR description for any UI change.
- Run `npm test` and `npm run build` before pushing. Both must pass.

### Testing
- Write Vitest unit tests for new utilities under `__tests__/` next to the code.
- Use accessible queries (`getByRole`, `getByLabelText`) over `data-testid`.
- Keep tests deterministic — no real network calls, no timers.
- PDF layout changes must be verified with `npm run test:mvp`.

### Environment Variables
- Any new `VITE_*` var must be added to `.env.example` with a placeholder and description
  in the same commit it is introduced.
- Server-side vars (`RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, Worker secrets) must
  never appear in Vite-bundled code. Enforce this by checking for `import.meta.env` usage
  in non-`src/` files.
