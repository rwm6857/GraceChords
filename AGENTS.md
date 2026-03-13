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
