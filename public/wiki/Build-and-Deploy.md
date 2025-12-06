Understand how the site builds, deploys, and keeps the wiki in sync.

## Overview
- Source is built by Vite into `docs/` for GitHub Pages
- GitHub Actions commit the built `docs/` back to `main`
- Adding songs/resources updates indices automatically
- Wiki content lives in this repo under `public/wiki/` and syncs to the GitHub Wiki
- SEO assets (sitemap/robots) live in `public/`; regenerate sitemap with `npm run generate:sitemap`

## Workflows

- Build site into `/docs` (app/source changes)
  - `.github/workflows/build-to-docs.yml`
  - Triggers on changes to `src/**`, `index.html`, `404.html`, `vite.config.js`, `package*.json`, and `public/**` (excluding `public/songs/**` and `public/wiki/**`)
  - Uses Node 20, runs `npm ci && npm run build`, commits `docs/`
  - Sets `VITE_COMMIT_SHA=${{ github.sha }}` to bust caches

- Rebuild song index (song changes)
  - `.github/workflows/update-index.yml`
  - Triggers on `public/songs/**`
  - Runs `node scripts/buildIndex.mjs`, commits `src/data/index.json`
  - That commit triggers the site build workflow

- Rebuild resources index (resource changes)
  - `.github/workflows/update-resources.yml`
  - Triggers on `public/resources/**`
  - Runs `npm run build-resources-index`, commits `src/data/resources.json`
  - That commit triggers the site build workflow

- Wiki sync (wiki changes)
  - `.github/workflows/wiki-sync.yml`
  - Triggers on `public/wiki/**`
  - Runs `node scripts/syncWiki.mjs` (pushes to `<repo>.wiki.git`), then builds `docs/`

## Secrets & Config
- `VITE_ADMIN_PW` — required for Admin; set locally in `.env` and as a repo secret for workflows
- `WIKI_PUSH_TOKEN` — classic PAT with `repo` scope for wiki sync
- Optional: `VITE_COMMIT_SHA` — set by CI; set locally when testing releases to invalidate caches

## Local Build & Preview
```bash
npm ci
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
npm run preview # http://localhost:4173
```

## Do not hand‑edit `docs/`
Commits to `docs/` are made by CI. Push source changes and let workflows update `docs/`.

[[Project-Structure]] [[Release-Checklist]]
