Understand how the site builds, deploys, and keeps the wiki in sync.

## Overview
- Source is built by Vite into `dist/` (gitignored)
- **Cloudflare Pages** deploys automatically on every push to `main` — no committed build output required
- SEO build scripts (`generate-seo-pages.mjs`, `generate-sitemap.mjs`) query Supabase and write static HTML/sitemap at build time
- Wiki content lives in this repo under `apps/web/public/wiki/` and syncs to the GitHub Wiki (see `wiki-sync.yml` below)
- `public/sitemap.xml` and `public/robots.txt` are committed and served from the site root

## Build output
`npm run build` runs three steps:
1. `vite build` → `dist/`
2. `node scripts/generate-seo-pages.mjs` → static HTML shells for every song and post
3. `node scripts/generate-sitemap.mjs` → `public/sitemap.xml`

Steps 2 and 3 require `SUPABASE_SERVICE_ROLE_KEY` to be set (they query songs and posts from Supabase).

## Deployment
Cloudflare Pages is connected to this repository and triggers a build on every push to `main`. This is a monorepo, so the Pages **root directory** is `apps/web`, the build command installs from the repo root and builds the web workspace, and the output directory is `dist/` (→ `apps/web/dist`). The exact CF settings and rationale are in [`MONOREPO_MIGRATION.md`](https://github.com/rwm6857/GraceChords/blob/main/MONOREPO_MIGRATION.md). No GitHub Actions workflow is needed for deployment.

Environment variables (Supabase URL, anon key, service role key, Cloudinary, etc.) are configured in the Cloudflare Pages dashboard under **Settings → Variables and Secrets**.

## GitHub Actions workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `pr-checks.yml` | Pull request to `main` | Lint + test + Vite build. Non-blocking (`continue-on-error`) — signal, not a gate |
| `wiki-sync.yml` | Push to `main` touching `apps/web/public/wiki/**` | Publishes the wiki source to the GitHub Wiki (needs `WIKI_PUSH_TOKEN`) |
| `feature-post.yml` | PR merged | Announces `feat(` PRs (or ones labelled `post` / containing `#post`) to the Telegram dev channel |
| `codeqL.yml` | Schedule / push | CodeQL security scanning |

## Cloudflare Workers (separate deploy)
Workers in `workers/` are deployed independently via Wrangler:
```bash
cd workers/pptx-upload && npm run deploy
```
They are not part of the Pages build. See [[Cloudflare-Infrastructure]] for details.

## Local Build & Preview
```bash
npm ci
# Optional: import Bible XML translations first
npm run build:bible -- --xml ./BIBLE_XML/EnglishESVBible.xml

VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
npm run preview  # http://localhost:4173
```

## Secrets & Config

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | CF Pages env, local `.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | CF Pages env, local `.env` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | CF Pages env (build only), local `.env` | SEO build scripts |
| `VITE_R2_PUBLIC_URL` | CF Pages env, local `.env` | R2 base URL for Bible JSON and PPTX assets |
| `VITE_PPTX_WORKER_URL` | CF Pages env, local `.env` | PPTX upload Worker URL |
| `VITE_CLOUDINARY_CLOUD_NAME` | CF Pages env, local `.env` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | CF Pages env, local `.env` | Cloudinary upload preset |
| `VITE_COMMIT_SHA` | CF Pages (auto) / CI | Service worker cache busting |
| `WIKI_PUSH_TOKEN` | GitHub repo secret | Wiki sync (classic PAT, repo scope) |

[[Project-Structure]] [[Release-Checklist]] [[Cloudflare-Infrastructure]]
