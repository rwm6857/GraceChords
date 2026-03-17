Understand where things live in the codebase and what each folder provides.

## At a glance
- `src/` — React app (components, pages, utils, styles, tests)
- `public/` — static assets (wiki source, bible data, fonts, sitemap, robots.txt)
- `supabase/` — database migrations (songs, posts, users, setlists, collaborator requests)
- `functions/` — Cloudflare Pages Functions (Bible CDN proxy)
- `workers/` — Cloudflare Workers (PPTX upload/delete, sitemap rebuild cron)
- `scripts/` — build and maintenance utilities
- `dist/` — Vite build output for Cloudflare Pages (gitignored, generated)

### `src/`
SPA entry point and components. Routes: Home, SongView, Setlist builder, Songbook builder, Resources, Worship Mode, Editor Portal, Admin Portal, Daily Word.

Key areas:
- `src/pages/` — route-level screens
- `src/components/auth/RoleGuard.jsx` — route guard; redirects users lacking the required role
- `src/hooks/useAuth.jsx` — auth context with full role system (`role`, `hasMinRole`, `isOwner`, etc.)
- `src/hooks/useSongs.jsx` — fetches song catalog from Supabase (module-level cache)
- `src/hooks/usePosts.jsx` — CRUD helpers for the Supabase `posts` table
- `src/lib/supabase.js` — Supabase client initialization
- `src/utils/setlists/supabaseSets.js` — Supabase-backed saved set operations
- `src/utils/pdf_mvp/` — single-song PDF engine with tests and font registrar
- `src/utils/pdf/` — facade and multi-song/songbook exports
- `src/utils/chordpro/` — parser, serializer, normalization, and helpers
- `src/styles/tokens.css` — UIKit-inspired design tokens (light/dark, spacing, type)
- `src/components/ui/layout-kit/` — reusable UI primitives (Card, Toolbar, Chip, etc.)
- `src/features/readings/` — Daily Word reading view (M'Cheyne plan + Bible loader)

### `public/`
Static assets committed to the repo:
- `public/wiki/` — source for GitHub Wiki pages (synced by `scripts/syncWiki.mjs`)
- `public/bible/` — translations manifest (`translations.json`) and locally-generated Bible chapter JSON (for dev/fallback)
- `public/fonts/` — UI fonts
- `public/sprites/` — icon/image sprites
- `public/sitemap.xml`, `public/robots.txt` — SEO assets; committed and served from site root

**Songs and posts are stored in Supabase, not in `public/`.**

### `supabase/`
SQL migration files applied in order:
- `migrations/20240001_create_user_starred_songs.sql`
- `migrations/20240002_fix_starred_songs_fk.sql`
- `migrations/20240003_add_delete_user_function.sql`
- `migrations/20260305_songs_migration.sql` — songs table, RLS, star-count trigger
- `migrations/20260307_collaborator_requests.sql` — collaborator request queue

### `functions/`
Cloudflare Pages Functions:
- `functions/bible/[[path]].js` — server-side proxy for Bible chapter JSON from R2 (avoids CORS in the browser)

### `workers/`
Standalone Cloudflare Workers deployed separately via Wrangler:
- `workers/pptx-upload/` — handles PPTX upload/delete to R2; validates JWT + role
- `workers/sitemap-rebuild/` — cron trigger (weekly) to rebuild the sitemap

### `scripts/`
Maintenance utilities:
- `syncWiki.mjs` — push `public/wiki/` to the GitHub Wiki repo
- `verifyWikiSetup.mjs` — diagnostic for wiki sync
- `generate-seo-pages.mjs` — generate static HTML for song/post pages (runs during `npm run build`)
- `generate-sitemap.mjs` — regenerate `public/sitemap.xml` (runs during `npm run build`)
- `bible-xml-to-json.mjs` — convert Bible XML to chapter JSON
- `convertChordProAll.mjs` — batch-convert songs to short directive style
- `exportAllJpgs.mjs` — export song JPG images

[[Index-Building]] [[UI-Design-System]] [[Roles-and-Access]] [[Cloudflare-Infrastructure]]
