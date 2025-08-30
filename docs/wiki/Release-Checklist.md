# Release Checklist

Use this checklist to ship changes to GraceChords confidently and avoid stale assets.

## Before You Start
- Node.js 20 LTS installed
- Fonts present under `public/fonts/` (Noto Sans + Noto Mono)

## 1) Add or Update Songs
- Place `.chordpro` files under `public/songs/`
- For PPTX, add files under `public/pptx/` named after the song slug

## 2) Rebuild the Index
```bash
npm run build-index
```
This generates `src/data/index.json` from `public/songs/**`. Commit it.

## 3) Run Tests (PDF MVP Guards)
```bash
npm run test:mvp
```
Guards the approved PDF layout (spacing, columns, chord alignment).

## 4) Build With Cache Busting
```bash
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
```
Outputs static site into `docs/` and embeds the commit in the service worker cache name.

## 5) Commit & Push
- Commit `public/**`, `src/data/index.json`, `docs/**`
- Push to `main` (GitHub Pages serves from `/docs`)

## 6) Verify On Production
- Hard refresh the site
- Confirm edited songs load (network-first fetch for `/songs/**` and `/src/data/index.json`)
- Export a few PDFs to verify visuals (title 26pt, key 16pt gray, lyric/chord ≥12pt)

## Optional: Service Worker Reset
If a client seems stale:
```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
```
Then reload.

## Troubleshooting
- Song changes not visible? Ensure `VITE_COMMIT_SHA` was set on build and the SW update completed
- Missing song in search? Re-run `npm run build-index` and commit `src/data/index.json`

