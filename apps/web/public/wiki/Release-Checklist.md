# Release Checklist

Use this checklist to ship changes to GraceChords confidently and avoid stale assets.

## Before You Start
- Node.js 20 LTS installed
- PDF fonts present under `src/assets/fonts/` (Noto Sans + Noto Mono)
- `.env` file configured with Supabase credentials and service role key

## 1) Song & Post Changes
Songs and posts are managed via the Supabase database:
- **Songs** — use the Editor Portal (`/editor`) to add/edit songs directly in Supabase
- **Posts** — use the Post editor (`/portal/posts`) to create or update blog posts
- **PPTX slides** — upload via the PPTX widget in the song editor (stored in R2)

## 2) Run Tests
```bash
npm run test:mvp
```
Guards the approved PDF layout (spacing, columns, chord alignment). Run the full suite with `npm test`.

## 3) Build & Verify Locally (Optional)
```bash
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
npm run preview
```
This embeds the commit in the service worker cache name for clean updates.

## 4) Deploy
Push to `main`. **Cloudflare Pages** automatically builds from `dist/` and deploys.

No manual deploy step is required. Watch the build status in the Cloudflare Pages dashboard.

## 5) Verify on Production
- Hard refresh the site (Ctrl+Shift+R)
- Confirm edited songs load (Supabase network-first)
- Export a PDF to verify visuals (title 26pt, key 16pt gray, lyric/chord ≥12pt)
- Confirm any new PPTX downloads work

## 6) Wiki Updates
If `public/wiki/**` changed, sync to GitHub Wiki:
```bash
WIKI_PUSH_TOKEN=<your_PAT> node scripts/syncWiki.mjs
```
Or trigger the `force-update.yml` workflow manually from GitHub Actions.

## Optional: Service Worker Reset
If a client appears stale:
```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
```
Then reload.

## Troubleshooting
- Song changes not visible? Ensure Supabase data is correct; check browser console for query errors
- Stale JS/CSS? Ensure `VITE_COMMIT_SHA` was set during the build and the CF Pages build completed
- Missing sitemap entries? Run `npm run generate:sitemap` locally, commit `public/sitemap.xml`, and push
