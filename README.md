# GraceChords

GraceChords is a React + Vite single-page application for managing and playing a ChordPro songbook. It supports fast search, chord transposition, setlist building, and PDF exports for practice or performance. Songs are stored in Supabase and served via authenticated API calls.

## Features
- Fast search with tag filters and translation-aware song catalog
- Song view with key transposition, chord toggling, and single-song PDF download
- Setlist builder for reordering and transposing multiple songs with multi-song PDF export (sticky pane headers, independent scrolling, named cloud saves, shareable links)
- Songbook builder for predefined groups of songs
- Role-based access control (user, collaborator, editor, admin, owner)
- Admin Portal for user/role management and collaborator request review
- Resources (blog-style posts) with search, tags, and an admin editor
- Daily Word reading view (M'Cheyne plan) with local Bible text, verse selection, and copy
- Light/dark theme toggle and keyboard shortcuts (`c`, `[`, `]`)
- SongView 1/2-column reading view
- Worship/Perform Mode — full-screen, touch-friendly view with auto-fit text, swipe/arrow navigation, and quick transpose

## Project Structure
```
src/            # components, hooks, utilities, tests
supabase/       # SQL migrations (songs, posts, users, starred songs, saved sets, collaborator requests)
public/         # font assets, bible data, wiki source, static assets
scripts/        # maintenance scripts (wiki sync, SEO generation, sitemap, Bible ingestion)
functions/      # Cloudflare Pages Functions (Bible CDN proxy)
workers/        # Cloudflare Workers (PPTX upload/delete, sitemap rebuild)
dist/           # Vite build output (gitignored, deployed to Cloudflare Pages)
```

## UI Styling
GraceChords uses a UIKit-inspired, token-driven UI kit.
- Tokens live in `src/styles/tokens.css` and drive colors, type scale, spacing, radii, and motion.
- Legacy aliases are mapped in `src/styles.css` (e.g., `--primary`, `--card`, `--text`) for back-compat.
- Reusable primitives live in `src/components/ui/layout-kit/` and are styled in `layout-kit.css`.
- Prefer `gc-*` classes and layout kit components for new UI. Avoid hardcoded colors.

## Installation

Use Node.js 20 LTS and install dependencies with `npm ci`:
```bash
npm ci
npm run dev
```

Visit `http://localhost:5173` (default Vite port) to explore the app.

### Environment Variables

Create a `.env` at the repo root (see `.env.example` for a full template):

```env
# Required — Supabase project credentials (Settings → API)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Required for build scripts (generate-seo-pages.mjs, generate-sitemap.mjs)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# PPTX Upload Worker (workers/pptx-upload/)
VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev

# Bible CDN — public R2 URL proxied by the CF Pages Function
VITE_BIBLE_CDN_URL=https://pub-xxxx.r2.dev

# Cloudinary — image hosting for song/post covers
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-upload-preset

# Optional
VITE_ENABLE_DISCLAIMER=1                  # set to 0 to disable footer/PDF disclaimers
VITE_CONTACT_EMAIL=you@example.com
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for all song loading and authentication. Find these in your Supabase project's **Settings → API** page.

`SUPABASE_SERVICE_ROLE_KEY` is used only by the Node build scripts (`generate-seo-pages.mjs`, `generate-sitemap.mjs`) to query songs and posts for static HTML generation; it is never bundled into the frontend.

`VITE_PPTX_WORKER_URL` points to the deployed `gracechords-pptx-upload` Cloudflare Worker. See [`workers/pptx-upload/README.md`](workers/pptx-upload/README.md) for setup. If omitted, the upload widget shows a configuration warning.

`VITE_BIBLE_CDN_URL` is the base public URL for Bible chapter JSON files served from Cloudflare R2. In local dev it is proxied by Vite to avoid CORS; in production it is proxied server-side by the `functions/bible/[[path]].js` Pages Function.

### Supabase Setup

Apply all migrations under `supabase/migrations/` in order to create the required tables and RLS policies. Key tables:
- `public.users` — user profiles with `role` column (`user`, `collaborator`, `editor`, `admin`, `owner`)
- `public.songs` — full song catalog with ChordPro content, metadata, and star counts
- `public.posts` — blog-style posts with title, slug, rich content, tags, status, and author
- `public.user_starred_songs` — per-user song stars
- `public.saved_sets` — Supabase-backed setlist saves for logged-in users
- `public.collaborator_requests` — queue for users requesting collaborator access

## Testing
Run the test suite with:
```bash
npm test
```

For more detail, see the [Getting Started](../../wiki/Getting-Started) and [Contributing](../../wiki/Contributing) pages.

## Building & Deployment

Generate the static site locally into `dist/` (gitignored):
```bash
npm run build
```

The build runs Vite, then generates static SEO HTML pages and a sitemap using the Supabase service role key.

**Production deployment** is handled by **Cloudflare Pages**, which connects to this repository and builds from `dist/` on every push to `main`. No manual deploy step or committed build output is required.

Daily Word requires Bible chapter JSON. Place XML files in `BIBLE_XML/` and run:
```bash
npm run build:bible -- --xml ./BIBLE_XML/EnglishNLTBible.xml
```

This writes chapter files to `public/bible/<lang>/<id>/` and updates `public/bible/translations.json`. In production, Bible JSON is served from Cloudflare R2 via the `functions/bible/[[path]].js` Pages Function (see [Cloudflare Infrastructure](../../wiki/Cloudflare-Infrastructure)).

Routing uses `BrowserRouter` plus a `404.html` SPA fallback so deep links work on static hosting.

## SEO & Sitemaps
- Per-page metadata is provided via `react-helmet-async`.
- Post-build step generates static HTML pages for `/songs/:id` and `/resources/:slug` (queries Supabase via `SUPABASE_SERVICE_ROLE_KEY`) so Google can crawl content before JS runs.
- Regenerate the sitemap with `npm run generate:sitemap` (writes `public/sitemap.xml`).
- `public/sitemap.xml` and `public/robots.txt` are committed and served from the site root.

## Roles & Access

GraceChords uses five roles: **user → collaborator → editor → admin → owner**.

| Role | Key Permissions |
|------|----------------|
| user | Star songs, personal features |
| collaborator | Suggest song edits/additions (requires 7-day-old account + admin approval) |
| editor | Add/edit songs & posts directly, approve suggestions; access to `/editor` |
| admin | Delete content, promote users, manage collaborator requests; access to `/admin` |
| owner | Unrestricted — promote to admin, delete accounts |

Routes `/admin` and `/editor` are protected by `RoleGuard`. Users without the required role are redirected to `/` with a toast.

### Admin Portal (`/admin`)
The Admin Portal lets admins and owners:
- View all users with roles and account ages
- Promote or demote user roles
- Approve or deny collaborator access requests
- (Owner only) Delete user accounts

### Editor Portal (`/editor`)
Landing page for editors linking to song and resource management tools.

### Requesting Collaborator Access
Regular users with 7+ day-old accounts can request collaborator access from the Profile page (`/profile`). Requests appear in the Admin Portal for review.

## Worship/Perform Mode
Full-screen, minimal UI optimized for live performance.

Access:
- From a song: use the "Open in Worship Mode" button.
- From a set: use "Open in Worship Mode" in Setlist to load the current set.
- Direct URL: `/worship/<id1,id2,...>` (comma-separated song IDs).

Layout & Fit:
- Renders an entire song on a single page, single column.
- Auto-fit font tries sizes `16 → 12` px and chooses the largest that fits; manual override available.

Controls (floating toolbar): NEXT, Key Up/Reset, Theme, Font Size A−/A+, Chords On/Off.

Navigation: swipe left/right on mobile; Arrow Right/Left on desktop.

Persistence: `worship:transpose`, `worship:showChords`, `worship:fontSize` in `localStorage`.

## Song Translations
GraceChords supports per-language variants linked by `song_id`.

- Link variants with `{song_id: <shared-id>}`.
- Mark language with `{lang: <code>}` (`en`, `tr`, `ar`, `es`). Defaults to English if omitted.
- Translation titles can differ from English titles; matching is by `song_id`.

Metadata inheritance: for each `song_id` group, English is master. Translations inherit `key`, `tags`, `authors`, `country`, `youtube`, `mp3`, and `pptx` unless they set a non-empty override.

Song Library: language chips appear for languages with at least one real translation. Results sort songs with selected-language translations first (A-Z), then the rest under "No Translation in Selected Language".

## Resources (Guides/Articles)
Posts are stored in the Supabase `posts` table. Each row has a title, slug, rich HTML content, excerpt, featured image URL, tags, author, and a `status` (`draft` | `published`).

- Index page: `/resources` — grid of cards, search, tag filters.
- Post page: `/resources/:slug` — renders post content with images, embeds, and related posts by tag.
- Editor: `/portal/posts` — requires editor role; uses a Tiptap rich-text editor.

## PDF Fonts
Place the following font files in `src/assets/fonts/`:
- `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`, `NotoSans-Italic.ttf`, `NotoSans-BoldItalic.ttf`
- `NotoSansMono-Regular.ttf`, `NotoSansMono-Bold.ttf`

## CI & Automation
Active workflows in `.github/workflows/`:
- **`notify_telegram.yml`**: on every `main` push, sends a Telegram message when the commit message contains `#post` or `#announce`; uses Claude to write the message if `ANTHROPIC_API_KEY` is set.
- **`force-update.yml`** (manual dispatch): syncs wiki, rebuilds sitemap, and runs `npm run build` — commits generated assets back to `main`.
- **`codeqL.yml`**: CodeQL security scanning.

Cloudflare Pages builds and deploys automatically on every `main` push — no separate deploy workflow is needed.

Wiki sync is available via the `force-update.yml` workflow (requires `WIKI_PUSH_TOKEN` secret) or locally:
```bash
WIKI_PUSH_TOKEN=<your_PAT> node scripts/syncWiki.mjs
```

**PDF Export (MVP Engine)**
- Engine: `src/utils/pdf_mvp/` (facade: `src/utils/pdf/`).
- Decision ladder: 1-col single page at sizes `16 → 12` pt; else 2-col at `16 → 12` pt; else 1-col multipage at 15 pt.
- Typography: Title 26 pt bold; lyrics/chords 12–16 pt with ~1.2× line-height.
- Tests: `npm run test:mvp`.
- See `src/utils/pdf_mvp/README.md` for details.

## PPTX Slides
PowerPoint lyric decks are stored in Cloudflare R2 (`gracechords-bible` bucket, `pptx/` prefix). Uploads and deletes go through the `gracechords-pptx-upload` Cloudflare Worker which validates JWT auth and role before writing to R2. See [`workers/pptx-upload/README.md`](workers/pptx-upload/README.md) and the wiki's [[Slides-(PPTX)]] page for the upload workflow.

## Offline Support
GraceChords registers a service worker to make core assets available offline. The cache name includes a commit hash from `VITE_COMMIT_SHA` so each deployment invalidates older caches.

```bash
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
```

Song files are fetched with a network-first strategy so edits appear promptly after deploy.

## Usage Notes
- **Home**: search and tag filters, per-song key, bundle builder at `/bundle`.
- **Song page**: sticky toolbar (transpose & download), chord toggle, 1/2-column reading view, collapsible media.
- **Setlist**: build/reorder sets, choose keys, cloud save/load by name (modal), share a link, export PDF/PPTX.
- **Songbook**: mirrors Setlist layout; export includes a TOC and optional cover image.
- **PDFs**: vector text with Noto Sans; sections stay together; auto-switches to two columns when needed.

## Sorting
Song results are sorted with numeric titles first; otherwise case-insensitively, ignoring leading punctuation (e.g., `'Tis` sorts under `T`). Translation-aware sorting shows songs with a variant in the selected language first.

## GitHub Wiki

Author or edit Markdown pages under `public/wiki/` (e.g., `Home.md`, `_Sidebar.md`).
Set the repo secret `WIKI_PUSH_TOKEN` (a classic PAT with `repo` scope) to allow pushes to `GraceChords.wiki`.
Trigger sync by pushing changes under `public/wiki/**` (workflow runs) or run locally:

```bash
WIKI_PUSH_TOKEN=<your_PAT> node scripts/syncWiki.mjs
```

If pages don't appear, run the diagnostic:
```bash
node scripts/verifyWikiSetup.mjs
```

## Cloudflare Infrastructure

| Service | Purpose |
|---------|---------|
| **Cloudflare Pages** | Hosts the SPA; builds from `dist/` on every push to `main` |
| **Pages Function** (`functions/bible/[[path]].js`) | Server-side proxy for Bible JSON from R2 (avoids CORS) |
| **R2 bucket** (`gracechords-bible`) | Stores PPTX slide decks (`pptx/` prefix) and Bible chapter JSON (`bible/` prefix) |
| **Worker** (`gracechords-pptx-upload`) | Authenticated upload/delete of PPTX files to R2 |
| **Worker** (`gracechords-sitemap-rebuild`) | Weekly cron (Sunday midnight UTC) to rebuild the sitemap |

See [Cloudflare Infrastructure](../../wiki/Cloudflare-Infrastructure) wiki page for full details.

## Next Steps
Explore utilities in `src/utils` for chord transposition and PDF generation, check `supabase/migrations/` for the database schema, and extend Vitest tests to safeguard future refactors.
