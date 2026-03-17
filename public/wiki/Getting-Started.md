Set up a local environment to develop or preview GraceChords.

## Prerequisites
- [Node.js LTS](https://nodejs.org/) (20+)
- Git
- A Supabase project (for auth, songs, and posts)

## Install and run
```bash
npm ci
npm run dev
```
Visit `http://localhost:5173`. The app uses Vite with BrowserRouter plus a `404.html` SPA fallback.

## Environment variables

Create a `.env` file at the repo root (copy `.env.example` as a starting point):

```env
# Required — Supabase credentials (Settings → API)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Required for build scripts only (generate-seo-pages.mjs, generate-sitemap.mjs)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# PPTX upload/delete Worker
VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev

# Bible CDN — R2 public URL for Bible chapter JSON
VITE_BIBLE_CDN_URL=https://pub-xxxx.r2.dev

# Cloudinary — image hosting for song/post covers
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-upload-preset

# Optional
VITE_ENABLE_DISCLAIMER=1       # set to 0 to hide footer/PDF disclaimers
VITE_CONTACT_EMAIL=you@example.com
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required — the app cannot load songs or authenticate without them.

`SUPABASE_SERVICE_ROLE_KEY` is only needed when running `npm run build` (SEO page + sitemap generation). It is never bundled into the frontend.

`VITE_BIBLE_CDN_URL` enables the Daily Word feature locally. In dev, Vite proxies `/bible/*` to this URL. In production the Cloudflare Pages Function handles the proxy.

## Supabase setup

Apply all migrations under `supabase/migrations/` in order. Key tables:
- `public.users` — user profiles with `role`
- `public.songs` — ChordPro song catalog
- `public.posts` — blog-style posts
- `public.user_starred_songs`, `public.saved_sets`, `public.collaborator_requests`

## Build for production
```bash
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
```
Output goes to `dist/`. In production, Cloudflare Pages builds and deploys automatically on push to `main`. See [[Build-and-Deploy]] for details.

[[Project-Structure]] [[Roles-and-Access]] [[Build-and-Deploy]]
