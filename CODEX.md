# GraceChords — Codex Context

This file seeds ChatGPT Codex with a complete understanding of the GraceChords project:
what it is, how it is built, how every service fits together, and the conventions that
govern all new work.

---

## 1. Project Overview

**GraceChords** is a React + Vite single-page application for worship teams and churches.
It manages a ChordPro songbook with chord transposition, setlist building, PDF/PPTX export,
a full-screen worship/perform mode, daily Bible readings, and a blog-style resources section.
Songs are stored in Supabase. Images are hosted on Cloudinary. Slide decks (PPTX) and Bible
JSON live in Cloudflare R2. The app is deployed to Cloudflare Pages.

### Who uses it
- **Congregation / regular users** — search songs, star favourites, read daily Bible passages.
- **Collaborators** — suggest song additions or edits (requires admin approval to gain the role).
- **Editors** — add/edit songs and posts directly; manage PPTX slide uploads.
- **Admins** — manage users, approve collaborator requests, delete content.
- **Owner** — unrestricted; promote to admin, delete accounts.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + Vite 7 |
| Routing | React Router 6 |
| Auth & database | Supabase (PostgreSQL + Auth + RLS) |
| Image hosting | Cloudinary (unsigned upload preset) |
| File storage | Cloudflare R2 (`gracechords-bible` bucket) |
| Hosting | Cloudflare Pages (auto-deploy on push to `main`) |
| Serverless functions | Cloudflare Workers (PPTX upload/delete, sitemap cron) |
| Pages Functions | `/functions/bible/`, `/functions/pptx/` (R2 CORS proxies) |
| Email | Resend (configured via env; used for transactional/notification emails) |
| Rich-text editor | Tiptap 3 (posts editor) |
| PDF engine | jsPDF + NotoSans fonts (`src/utils/pdf_mvp/`) |
| Fuzzy search | Fuse.js |
| SEO | react-helmet-async + post-build static HTML generation |
| Offline | Service worker (network-first, cache-busted per deploy) |
| Testing | Vitest + @testing-library/react + happy-dom |
| CI/CD | GitHub Actions (Telegram notify, wiki sync, CodeQL, CF Pages deploy) |

---

## 3. External Service Integrations

### 3.1 Supabase
- **Auth** — email/password + OAuth. Session managed in `src/hooks/useAuth.jsx`.
- **Database** — PostgreSQL with RLS. All client calls go through `src/lib/supabase.js`.
- **Key tables** — `users`, `songs`, `posts`, `user_starred_songs`, `saved_sets`,
  `collaborator_requests`, `setlists`, `setlist_songs`.
- **RPCs** — `update_user_role(target_user_id, new_role)`,
  `admin_delete_user(target_user_id)`.
- **Env vars** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend);
  `SUPABASE_SERVICE_ROLE_KEY` (build scripts only — never bundled).

### 3.2 Cloudflare Pages
- Hosts the SPA. Builds `dist/` on every push to `main` via `.github/workflows/pages-deploy.yml`.
- All `VITE_*` env vars are configured in Pages → Settings → Variables.
- `404.html` and `BrowserRouter` together handle deep-link routing on static hosting.
- Pages Functions in `functions/` run server-side without a separate Worker deployment.

### 3.3 Cloudflare R2
- Bucket: `gracechords-bible`.
- Paths: `pptx/<slug>.pptx` (slide decks), `bible/<lang>/<id>/*.json` (Bible chapters).
- Public base URL: `VITE_R2_PUBLIC_URL` (e.g. `https://assets.gracechords.com`).
- In production, the `functions/bible/[[path]].js` and `functions/pptx/[[path]].js`
  Pages Functions proxy requests to R2 to avoid CORS issues.
- In local dev, Vite proxies `/bible` and `/pptx` to the same base URL.

### 3.4 Cloudflare Workers
- **`gracechords-pptx-upload`** (`workers/pptx-upload/`) — authenticated PPTX
  upload/delete. Validates a Supabase JWT, checks the user's role (`collaborator+` for
  upload, `editor+` for delete), then reads/writes R2.
  Config: `workers/pptx-upload/wrangler.toml`.
- **`gracechords-sitemap-rebuild`** (`workers/sitemap-rebuild/`) — cron trigger
  `0 0 * * 0` (Sunday midnight UTC) to regenerate `public/sitemap.xml`.

### 3.5 Cloudinary
- Unsigned image uploads via `VITE_CLOUDINARY_CLOUD_NAME` + `VITE_CLOUDINARY_UPLOAD_PRESET`.
- Used for song cover images and post featured images.
- URLs are stored in the `songs` and `posts` tables (column: `featured_image_url`).
- No server-side Cloudinary SDK; all uploads are direct from the browser.

### 3.6 Resend
- Transactional / notification emails.
- Env var: `RESEND_API_KEY` (server-side only; never exposed to the frontend).
- Integration point: Cloudflare Worker or Supabase Edge Function (check `workers/` for
  the current implementation).
- Not yet fully wired in all flows; look for `resend` imports to find active usage.

---

## 4. Repository Layout

```
GraceChords/
├── src/
│   ├── main.jsx                  # App bootstrap — auth, theme, service-worker init
│   ├── App.jsx                   # React Router registry (19 routes + 404 fallback)
│   ├── sw.js                     # Service worker (network-first for songs & index)
│   ├── pages/                    # Route-level screens (one file per route)
│   │   ├── HomeDashboardPage.jsx
│   │   ├── SongsPage.jsx
│   │   ├── SongViewPage.jsx      # Single-song view — transpose, PDF, media (33 KB)
│   │   ├── SetlistPage.jsx       # Setlist builder — cloud save/load, PDF/PPTX export (61 KB)
│   │   ├── SongbookPage.jsx
│   │   ├── WorshipModePage.jsx   # Full-screen perform mode (65 KB)
│   │   ├── ReadingsPage.tsx      # M'Cheyne daily Bible readings
│   │   ├── PostsPage.jsx / PostDetailPage.jsx
│   │   ├── AdminPage.jsx         # User/role management (admin+)
│   │   ├── ProfilePage.jsx       # User profile + collaborator request
│   │   ├── LoginPage.jsx / SignupPage.jsx / AuthCallbackPage.jsx
│   │   ├── ForgotPasswordPage.jsx / ResetPasswordPage.jsx
│   │   └── portal/               # Editor portal workflows
│   │       ├── EditorPage.jsx
│   │       ├── ManagePostsPage.jsx
│   │       ├── EditPostPage.jsx   # Tiptap rich-text editor
│   │       ├── MobileEditorPage.jsx
│   │       └── MobilePortalPage.jsx
│   ├── components/
│   │   ├── auth/RoleGuard.jsx    # Redirect if below required role
│   │   ├── admin/                # Admin portal UI
│   │   ├── editor/               # Song/post editor components, AuditLogPanel
│   │   ├── editor/mobile/        # Mobile-specific editor UI
│   │   ├── song/                 # Song-level components (StarButton, etc.)
│   │   ├── layout/               # PageContainer, Navbar
│   │   ├── ui/
│   │   │   ├── layout-kit/       # Design-system primitives (Button, Card, Chip, …)
│   │   │   ├── layout-kit.css
│   │   │   └── mobile/           # MobileActionSheet, MobileDock, MobilePaneTabs, MobileSheet
│   │   ├── Icons.jsx             # Central SVG icon library
│   │   ├── Toast.jsx / Busy.jsx / OfflineBadge.jsx / ErrorBoundary.jsx
│   │   ├── KeySelector.jsx
│   │   ├── BibleTranslationPicker.tsx
│   │   └── CollaboratorRequest.jsx
│   ├── hooks/
│   │   ├── useAuth.jsx           # Auth context — session, role, hasMinRole()
│   │   ├── useSongs.jsx          # Fetch & module-cache all songs
│   │   ├── usePosts.jsx          # Posts CRUD
│   │   ├── useSetlists.js        # Setlist CRUD (Supabase-backed)
│   │   ├── useRole.js            # Role-check helpers
│   │   └── useIsMobile.js
│   ├── utils/
│   │   ├── app/theme.js          # Light/dark toggle & persistence
│   │   ├── app/toast.js          # Global toast queue
│   │   ├── songs/                # songCatalog, tags, sort, chords, verseRef, …
│   │   ├── chordpro/             # Parser, serialiser, transposition, diatonic helpers
│   │   ├── pdf/                  # PDF facade — downloadSingleSongPdf, songbook, etc.
│   │   ├── pdf_mvp/              # jsPDF MVP engine (see pdf_mvp/README.md)
│   │   ├── setlists/             # sets.js (localStorage legacy), setcode.js (URL encoding)
│   │   ├── export/               # downloadSetlist.js, combinePptx.js
│   │   ├── media/                # image.js, smartPreviewAndShareJPG.js
│   │   ├── bible/                # chapters.js, translations.js, direction.js (RTL)
│   │   ├── content/              # markdown.js
│   │   └── network/              # fetchCache.js, headCache.js, publicUrl.js, github.js
│   ├── features/
│   │   └── readings/             # M'Cheyne plan — useMcheyne.ts, PassageReader.tsx, …
│   ├── lib/supabase.js           # Supabase client singleton
│   ├── styles/
│   │   ├── tokens.css            # --gc-* design tokens (THE source of truth for all colours/spacing)
│   │   ├── index.css             # Imports all stylesheets
│   │   ├── base.css / fonts.css
│   │   ├── cards.css / auth.css / admin.css / admin-portal.css
│   │   ├── editor.css / mobile-editor.css / posts.css / songbook.css
│   │   └── (ui.css inside ui/)
│   └── assets/fonts/             # NotoSans* TTF files for PDF export
├── functions/
│   ├── bible/[[path]].js         # CF Pages Function — R2 proxy for Bible JSON
│   └── pptx/[[path]].js          # CF Pages Function — R2 proxy for PPTX files
├── workers/
│   ├── pptx-upload/              # CF Worker — authenticated PPTX upload/delete
│   └── sitemap-rebuild/          # CF Worker — weekly sitemap cron
├── scripts/
│   ├── generate-seo-pages.mjs    # Post-build: static HTML for songs & posts (SEO)
│   ├── generate-sitemap.mjs      # Write public/sitemap.xml
│   ├── bible-xml-to-json.mjs     # Convert Bible XML → JSON for public/bible/
│   ├── syncWiki.mjs              # Push public/wiki/ → GitHub Wiki
│   └── exportAllJpgs.mjs / convertChordProAll.mjs
├── public/
│   ├── bible/                    # translations.json + chapter JSON (R2 in prod, local in dev)
│   ├── wiki/                     # GitHub Wiki markdown source
│   ├── fonts/                    # Inter Variable + system UI fonts
│   ├── sprites/                  # SVG icon sprites
│   ├── sitemap.xml / robots.txt
│   └── gc-brand-*.svg            # Logo assets
├── .github/workflows/
│   ├── pages-deploy.yml          # CF Pages auto-deploy on push to main
│   ├── notify_telegram.yml       # Telegram post on #post / #announce commit tags
│   ├── force-update.yml          # Manual: wiki sync + sitemap rebuild + build
│   └── codeqL.yml                # CodeQL security scanning
├── index.html                    # Vite SPA entry point
├── 404.html                      # SPA deep-link fallback
├── vite.config.js
├── package.json
├── .env.example
├── AGENTS.md                     # Contributor & AI-agent guidelines
├── CODEX.md                      # (this file) ChatGPT Codex context seed
└── README.md                     # Public-facing project documentation
```

---

## 5. Key Files

| File | Purpose |
|---|---|
| `src/main.jsx` | Mounts React app; registers service worker; applies saved theme |
| `src/App.jsx` | All routes — lazy-loaded pages via `React.lazy()` |
| `src/lib/supabase.js` | Single Supabase client; import everywhere you need DB/auth |
| `src/hooks/useAuth.jsx` | `{ session, user, profile, role, hasMinRole, isAdmin, isOwner }` |
| `src/hooks/useSongs.jsx` | Fetches all songs once; module-level cache; returns `{ songs, loading }` |
| `src/styles/tokens.css` | `--gc-*` CSS custom properties — single source of truth for the design system |
| `src/components/ui/layout-kit/` | Card, Button, Chip, Field, Toolbar, SegmentedControl, IconButton, PageHeader, Panel |
| `src/utils/chordpro/parser.js` | ChordPro text → structured section/line blocks |
| `src/utils/chordpro/index.js` | `transposeSymPrefer()`, chord parsing helpers |
| `src/utils/pdf_mvp/index.js` | PDF generation — decision ladder, chord alignment, NotoSans fonts |
| `src/utils/setlists/setcode.js` | `encodeSet()` / `decodeSet()` — compact URL-safe setlist encoding |
| `src/utils/songs/songCatalog.js` | Group songs by translation, resolve language preference |
| `src/utils/songs/sort.js` | Numeric-first, ignore leading punctuation sort |
| `src/sw.js` | Service worker — network-first for `/songs`, stale-while-revalidate elsewhere |
| `functions/bible/[[path]].js` | Streams Bible JSON from R2, sets CORS + Cache-Control headers |
| `workers/pptx-upload/src/index.js` | JWT auth → role check → R2 write/delete |

---

## 6. Database Schema (Supabase / PostgreSQL)

### `public.users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | FK → auth.users |
| role | text | `user \| collaborator \| editor \| admin \| owner` |
| display_name | text | Optional |
| account_created_at | timestamptz | |

### `public.songs`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| slug | text UNIQUE | URL key, e.g. `amazing-grace` |
| title | text | |
| artist | text | Comma-separated or JSON |
| default_key | text | e.g. `C`, `Em` |
| tags | text[] | e.g. `['worship','fast']` |
| chordpro_content | text | Full ChordPro markup |
| youtube_id | text | Optional |
| song_group_id | UUID | Links translation variants |
| has_stems | boolean | GraceTracks integration |
| stem_slug / gracetracks_url | text | GraceTracks links |
| star_count | int | Maintained by trigger |
| is_deleted | boolean | Soft delete |

### `public.posts`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| slug | text UNIQUE | |
| title / excerpt | text | |
| content | text | HTML (Tiptap output) |
| featured_image_url | text | Cloudinary URL |
| tags | text[] | |
| status | text | `draft \| published` |
| author_id | UUID FK | → users |
| published_at / created_at | timestamptz | |

### `public.setlists`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| owner_id | UUID FK | → users |
| name | text | |
| service_date | date | Optional |
| team_id | UUID | Optional team sharing |
| edit_mode | text | `suggest` (default) |

### `public.setlist_songs`
| Column | Type | Notes |
|---|---|---|
| setlist_id / song_id | UUID FK | Many-to-many |
| position | int | Order in set |
| key_override | text | Per-song transposition |
| notes | text | |

### Other tables
- `public.user_starred_songs` — `(user_id, song_id)` unique pairs; trigger increments `songs.star_count`.
- `public.collaborator_requests` — `status: pending | approved | denied`.

**All tables have RLS enabled.** Test with a non-owner account before shipping any schema change.

---

## 7. Routes

```
/                         HomeDashboardPage
/songs                    SongsPage
/song/:id  /songs/:id     SongViewPage
/setlist                  SetlistPage
/setlist/:songIds         SetlistPage  (pre-populated)
/set/:code                SetlistPage  (decoded from compact URL)
/songbook                 SongbookPage
/worship/:songIds         WorshipModePage
/worship/set/:code        WorshipSetRoute → WorshipModePage
/reading                  ReadingsPage
/posts  /posts/:slug      PostsPage / PostDetailPage
/profile                  ProfilePage
/login  /signup           Auth pages
/auth/callback            AuthCallbackPage (Supabase OAuth)
/forgot-password          ForgotPasswordPage
/reset-password           ResetPasswordPage
/admin                    AdminPage          (requires admin)
/editor                   EditorPage         (requires editor)
/portal/editor            PortalEditorPage   (requires collaborator+)
/portal/editor/:slug      PortalEditorPage   (edit specific song)
/portal/audit             AuditLogPanel      (requires admin)
/portal/posts             ManagePostsPage    (requires editor)
/portal/posts/new         EditPostPage
/portal/posts/:id/edit    EditPostPage
/about                    AboutPage
/*                        404 fallback
```

---

## 8. Environment Variables

```env
# ── Required (frontend) ────────────────────────────────────────────
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# ── Required (build scripts only — never bundled) ──────────────────
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Cloudflare R2 ─────────────────────────────────────────────────
VITE_R2_PUBLIC_URL=https://assets.gracechords.com

# ── Cloudflare Workers ────────────────────────────────────────────
VITE_PPTX_WORKER_URL=https://gracechords-pptx-upload.your-subdomain.workers.dev

# ── Cloudinary ────────────────────────────────────────────────────
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-upload-preset

# ── Resend ────────────────────────────────────────────────────────
RESEND_API_KEY=re_your-api-key          # server-side only

# ── Optional ──────────────────────────────────────────────────────
VITE_ENABLE_DISCLAIMER=1
VITE_CONTACT_EMAIL=you@example.com
VITE_ADMIN_PW=your-password             # legacy CLI gate
VITE_COMMIT_SHA=$(git rev-parse HEAD)   # service worker cache busting
```

**Rule:** every time a new env var is introduced, `.env.example` must be updated in the
same commit with a placeholder value and a one-line description.

Production values live in **Cloudflare Pages → Settings → Variables**. Never commit `.env`.

---

## 9. npm Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173` |
| `npm run build` | Vite build → `dist/`, then SEO pages + sitemap |
| `npm run preview` | Serve `dist/` locally |
| `npm run build:bible` | Convert Bible XML → JSON (`public/bible/`) |
| `npm run generate:sitemap` | Regenerate `public/sitemap.xml` |
| `npm test` | Run full Vitest suite |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:mvp` | PDF MVP engine tests only |
| `npm run normalize` | Normalise song/PPTX filenames |

---

## 10. Coding Conventions

- **Indentation:** 2 spaces; single quotes; no semicolons (match existing files).
- **Components:** `PascalCase.jsx`. **Utilities:** `camelCase.js` or `.ts`.
- **Tests:** `__tests__/` next to code; `*.test.(js|jsx|ts|tsx)`.
- **CSS:** always use `--gc-*` tokens from `tokens.css`; never hardcode hex values; use
  `gc-*` class names from the layout kit for new UI.
- **Imports:** absolute from `src/` (Vite alias `@/` not configured; use relative paths).
- **Role checks:** always use `hasMinRole(minRole)` from `useAuth`; never hardcode role
  strings in component logic except when adding a new role tier.
- **RLS:** every new Supabase table must have RLS enabled and appropriate policies.
- **Comments:** only add when the WHY is non-obvious (hidden constraint, subtle invariant,
  workaround). No restating what the code already says.

---

## 11. Commit & PR Conventions

- **Conventional Commits** — `type(scope): summary`.
  - `feat(setlist): add team sharing`, `fix(pdf): prevent orphan lines`,
    `chore(index): rebuild`.
- PRs must include: clear description, linked issues, screenshots/GIFs for UI changes,
  note of any Supabase migration impacts.
- Before opening: `npm test`, `npm run build`. If schema changed, note which migrations
  to apply.
- Never commit secrets or `.env`. Never hand-edit `dist/`.

---

## 12. Development State (as of 2026-04)

### Shipped and production-ready
- Song catalog, search, tag filters, translation-aware sorting
- Song view — transposition, chord toggle, 1/2-column, inline YouTube embed
- Setlist builder — cloud save/load, shareable links, multi-song PDF/PPTX export
- Songbook builder — TOC, PDF export
- Worship / Perform Mode — full-screen, auto-fit, swipe navigation, clock/stopwatch
- Daily Word — M'Cheyne plan, multiple Bible translations, RTL support
- Blog/Resources — Tiptap editor, Cloudinary images, tag filters
- PPTX slide upload/delete (CF Worker + R2)
- PDF export MVP engine (jsPDF, NotoSans, chord alignment, 1-col/2-col decision ladder)
- Role-based access (5 tiers), Admin Portal, collaborator request flow
- Mobile-native editor (tablet/phone workflows)
- GraceTracks stem integration (`has_stems`, `stem_slug`, `gracetracks_url`)
- Light/dark theme, offline service worker, SEO static generation, sitemap

### Recently completed
- Mobile editor (PR #253)
- Setlist width fix on mobile (PR #252)
- Consolidated download action sheet on SongView (PR #248)
- Inline YouTube embed replacing collapsible media drawer (PR #247)
- `VITE_R2_PUBLIC_URL` refactor — unified Bible + PPTX CDN base URL
- Full-width SongView container restore (PR #254)

### Known gaps / in-progress
- Resend email integration — env var configured; active usage limited; check `workers/`
  for current send points.
- Song translation linking — infrastructure in place (`song_group_id`), UI linking not
  yet fully wired.
- No E2E tests — unit + component coverage via Vitest; Cypress/Playwright not yet added.
- Bible XML → JSON conversion requires local XML files in `BIBLE_XML/` (not committed).
