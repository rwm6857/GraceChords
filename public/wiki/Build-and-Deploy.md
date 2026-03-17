Understand how the site builds, deploys, and keeps the wiki in sync.

## Overview
- Source is built by Vite into `dist/` (gitignored)
- **Cloudflare Pages** deploys automatically on every push to `main` — no committed build output required
- SEO build scripts (`generate-seo-pages.mjs`, `generate-sitemap.mjs`) query Supabase and write static HTML/sitemap at build time
- Wiki content lives in this repo under `public/wiki/` and syncs to the GitHub Wiki
- `public/sitemap.xml` and `public/robots.txt` are committed and served from the site root

## Build output
`npm run build` runs three steps:
1. `vite build` → `dist/`
2. `node scripts/generate-seo-pages.mjs` → static HTML shells for every song and post
3. `node scripts/generate-sitemap.mjs` → `public/sitemap.xml`

Steps 2 and 3 require `SUPABASE_SERVICE_ROLE_KEY` to be set (they query songs and posts from Supabase).

## Deployment
Cloudflare Pages is connected to this repository and triggers a build on every push to `main`. The build command is `npm run build` and the output directory is `dist/`. No GitHub Actions workflow is needed for deployment.

Environment variables (Supabase URL, anon key, service role key, Cloudinary, etc.) are configured in the Cloudflare Pages dashboard under **Settings → Environment variables**.

## GitHub Actions workflows

| File | Trigger | Purpose |
|------|---------|---------|
| `notify_telegram.yml` | Push to `main` | Sends a Telegram message when commit contains `#post` or `#announce` |
| `force-update.yml` | Manual dispatch | Syncs wiki, regenerates sitemap, runs `npm run build`, commits changed assets |
| `codeqL.yml` | Schedule / push | CodeQL security scanning |
| `pages-deploy.yml` | Branch `archive/gh-pages-static` | **Archived** — legacy GitHub Pages deploy; not used on `main` |

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
| `VITE_BIBLE_CDN_URL` | CF Pages env, local `.env` | R2 public URL for Bible JSON |
| `VITE_PPTX_WORKER_URL` | CF Pages env, local `.env` | PPTX upload Worker URL |
| `VITE_CLOUDINARY_CLOUD_NAME` | CF Pages env, local `.env` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | CF Pages env, local `.env` | Cloudinary upload preset |
| `VITE_COMMIT_SHA` | CF Pages (auto) / CI | Service worker cache busting |
| `WIKI_PUSH_TOKEN` | GitHub repo secret | Wiki sync (classic PAT, repo scope) |

[[Project-Structure]] [[Release-Checklist]] [[Cloudflare-Infrastructure]]
