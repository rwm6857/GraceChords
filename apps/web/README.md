# @gracechords/web

The GraceChords web app — a React + Vite single-page application for managing and
playing a ChordPro songbook. It powers the production site at
[gracechords.com](https://gracechords.com).

This is one workspace in the GraceChords monorepo. For the project overview and
how the pieces fit together, see the [root README](../../README.md). For AI/agent
development conventions, see [`AGENTS.md`](AGENTS.md) in this directory.

## Features

- **Song Library** — fast fuzzy search, tag filters, and a translation-aware catalog.
- **SongView** — key transposition, chord on/off toggle, 1/2-column reading view, single-song PDF download, collapsible media (YouTube/MP3).
- **Worship / Perform Mode** — full-screen, touch-friendly view with auto-fit text, swipe/arrow navigation, and quick transpose.
- **Setlist builder** — reorder and transpose multiple songs, named cloud saves, shareable links, and multi-song PDF/PPTX export.
- **Songbook builder** — predefined song groups with a table of contents and optional cover.
- **Daily Word** — M'Cheyne Bible reading plan with local scripture text, verse selection, and copy.
- **Resources** — blog-style posts with search, tags, and a rich-text admin editor.
- **Admin & Editor portals** — user/role management, collaborator request review, and content editing.
- **Roles** — user → collaborator → editor → admin → owner, enforced by `RoleGuard`.
- **Offline support** — a service worker caches core assets; cache is busted per deploy.
- **Theming & i18n** — light/dark toggle, keyboard shortcuts (`c`, `[`, `]`), and multi-language UI (en, tr, ar, es).

See the [wiki](../../../../wiki) for full user and feature guides.

## Stack

- **React 18 + Vite 7**, React Router v6 (`BrowserRouter` + `404.html` SPA fallback).
- **Supabase** for auth and data.
- **jsPDF** PDF engine (`src/utils/pdf_mvp/`) and a Canvas2D JPG exporter (`src/utils/media/`).
- **i18next** for UI translations.
- Shared logic from **`@gracechords/core`**; design tokens from **`@gracechords/tokens`**.

## Getting started

From the **repo root** (installs all workspaces from the root lockfile):

```bash
npm ci
npm run dev        # → http://localhost:5173
```

Or work inside this directory directly:

```bash
cd apps/web
npm run dev
```

The root delegating scripts (`npm run dev`, `build`, `test`, `lint`) all forward
to `-w @gracechords/web`.

## Environment variables

Create a `.env` at the **repo root** (the web build reads it via Vite's `envDir`).
Copy [`.env.example`](../../.env.example) for the full, annotated template.

```env
# Required — Supabase (Settings → API)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Required for build scripts (generate-seo-pages.mjs, generate-sitemap.mjs) — never bundled
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# PPTX upload Worker
VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev

# R2 public base URL (Bible JSON under /bible/, PPTX under /pptx/)
VITE_R2_PUBLIC_URL=https://assets.gracechords.com

# Cloudinary image hosting
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-upload-preset

# Optional
VITE_ENABLE_DISCLAIMER=1
VITE_CONTACT_EMAIL=you@example.com
```

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are required for all song loading and auth.
- `SUPABASE_SERVICE_ROLE_KEY` is used **only** by the Node build scripts to generate static SEO HTML and the sitemap. It is never bundled into the frontend.
- Production values are configured in **Cloudflare Pages → Settings → Variables**. Any new `VITE_*` variable must be added to `.env.example` in the same commit.

## Supabase setup

Apply the migrations under [`supabase/migrations/`](../../supabase/migrations/) (repo
root) in order. Key tables:

- `public.users` — profiles with a `role` column (`user`, `collaborator`, `editor`, `admin`, `owner`)
- `public.songs` — full song catalog (ChordPro content, metadata, star counts)
- `public.posts` — blog-style resources (title, slug, rich content, tags, status, author)
- `public.user_starred_songs` — per-user song stars
- `public.saved_sets` — cloud-saved setlists for logged-in users
- `public.collaborator_requests` — queue for users requesting collaborator access

Every table has row-level security — test query changes with a `user`-role account.

## Commands

```bash
npm run dev            # Vite dev server (http://localhost:5173)
npm run build          # Vite build + SEO pages + sitemap → apps/web/dist/
npm run preview        # preview the production build
npm test               # Vitest (happy-dom + Testing Library)
npm run test:run       # single-run Vitest
npm run test:mvp       # PDF MVP engine safeguards
npm run lint           # ESLint flat config
npm run generate:sitemap   # regenerate public/sitemap.xml
npm run build:bible -- --xml ./BIBLE_XML/EnglishNLTBible.xml   # ingest Bible XML → JSON
```

## Building & deployment

`npm run build` runs Vite, then generates static SEO HTML pages for `/songs/:id`
and `/resources/:slug` (querying Supabase with the service-role key) and a
sitemap, emitting everything to **`apps/web/dist/`** (gitignored).

Production is deployed by **Cloudflare Pages**, which builds from this
directory on every push to `main` — no manual deploy step. The Pages settings
(root directory `apps/web`, the workspace-aware build command, output `dist`)
are documented in [`MONOREPO_MIGRATION.md`](../../MONOREPO_MIGRATION.md).

Bust the service worker cache on production builds by passing the commit SHA:

```bash
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
```

## Project layout

```
apps/web/
├── src/            React app — pages, components, hooks, utils, styles, tests
├── public/         static assets — wiki source, bible JSON, fonts, resources
├── functions/      Cloudflare Pages Functions (bible/, pptx/, api/ proxies)
├── scripts/        maintenance scripts (SEO, sitemap, bible ingest, wiki sync, i18n check)
├── index.html      SPA entry
├── 404.html        SPA deep-link fallback
└── vite.config.js
```

See [`src/README.md`](src/README.md) for the `src/` organization and
[`AGENTS.md`](AGENTS.md) for the full set of web conventions (design tokens,
PDF engine, service worker, i18n workflow, Cloudflare wiring).

## PDF fonts

PDF export needs these font files in `src/assets/fonts/`:

- `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`, `NotoSans-Italic.ttf`, `NotoSans-BoldItalic.ttf`
- `NotoSansMono-Regular.ttf`, `NotoSansMono-Bold.ttf`

## Learn more

- [PDF engine notes](src/utils/pdf_mvp/README.md)
- [Layout kit primitives](src/components/ui/layout-kit/README.md)
- Wiki: [Getting Started](../../../../wiki/Getting-Started) · [Project Structure](../../../../wiki/Project-Structure) · [Cloudflare Infrastructure](../../../../wiki/Cloudflare-Infrastructure)
