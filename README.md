# GraceChords

GraceChords is a React + Vite single-page application for managing and playing a ChordPro songbook. It supports fast search, chord transposition, setlist building, and PDF exports for practice or performance.

## Features
- 🔍 Instant search with tag filters
- 🌐 Translation-aware song catalog (`song_id` + language chips)
- 🎸 Song view with key transposition, chord toggling, and single-song PDF download
- 📋 Setlist builder for reordering and transposing multiple songs with multi-song PDF export (sticky pane headers, independent scrolling, named saves, shareable links)
- 📦 Bundle download for predefined groups of songs
- 🛠️ Admin interface for authoring songs and rebuilding the index
- 📚 Resources (blog-style posts) with search, tags, and an admin editor
- 📖 Daily Word reading view (M’Cheyne plan) with local Bible text, verse selection, and copy
- 🌓 Light/dark theme toggle and keyboard shortcuts (`c`, `[`, `]`)
 - 🧭 SongView 1/2‑column reading view (site‑side)
- 🎤 Worship/Perform Mode — full‑screen, touch‑friendly view with auto‑fit text, swipe/arrow navigation, and quick transpose

## Project Structure
```
src/            # components, hooks, utilities, tests
public/         # ChordPro files and font assets
public/bible/   # translation manifest + generated Bible chapter JSON
scripts/        # maintenance scripts (e.g., index generation)
docs/           # Vite build output for GitHub Pages
```
Bible XML source files should be placed under `BIBLE_XML/` (not committed) for import into `public/bible/<lang>/<id>/`.

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

## Testing
Run the test suite with:
```bash
npm test
```

For more detail, see the [Getting Started](../../wiki/Getting-Started) and [Contributing](../../wiki/Contributing) pages.

## Building & Deployment
See the wiki page for details on CI/CD and wiki sync: ../../wiki/Build-and-Deploy
Generate the static site into `docs/` and push to the `main` branch to serve via GitHub Pages:
```bash
npm run build
# commit & push -> serve from /docs
```
Daily Word requires local Bible chapter JSON. Place XML files in `BIBLE_XML/` and run:
```bash
npm run build:bibles
```
Run this only when Bible XML files are added/updated.

To ingest a single XML translation into the shared Bible structure:
```bash
npm run build:bible -- --xml ./BIBLE_XML/EnglishNLTBible.xml
```

This writes chapter files to `public/bible/<lang>/<id>/` and updates `public/bible/translations.json`.
Keep `docs/CNAME` (custom domain) and the root `404.html` (SPA fallback) when deploying.

Routing uses `BrowserRouter` plus prebuilt shell pages and a 404 redirect so deep links work on static hosting.

## SEO & Sitemaps
- Per-page metadata is provided via `react-helmet-async` (`HelmetProvider` in `src/main.jsx`, with `Helmet` in route pages such as `src/pages/HomeDashboardPage.jsx` and `src/pages/SongViewPage.jsx`).
- Song pages tagged `ICP` get an InterCP-specific meta extension (description/keywords/JSON-LD) plus a visible badge on the page.
- Post-build step generates static HTML pages for `/songs/:id` and `/resources/:slug` (plus shell pages for top routes) so Google can crawl lyrics/content before JS runs.
- Regenerate the sitemap with `npm run generate:sitemap` (writes `public/sitemap.xml` with top-level routes plus `/songs/:id` and `/resources/:slug`).
- `public/sitemap.xml` and `public/robots.txt` are served from the site root on GitHub Pages; keep both committed.

## Worship/Perform Mode
Full‑screen, minimal UI optimized for live performance.

Access
- From a song: use the “Open in Worship Mode” button on the Song page.
- From a set: use “Open in Worship Mode” in Setlist to load the current set.
- Direct URL: `/worship/<id1,id2,...>` (comma‑separated song IDs). Example: `/worship/abba,above-all`.

Layout & Fit
- Renders an entire song on a single page (no pagination), single column.
- Auto‑fit font using the same candidate window as the PDF engine: tries sizes `16 → 12` px and chooses the largest that fully fits the viewport; you can override manually.
- Chords render above lyrics with exact positioning; comments display in italic.

Controls (floating toolbar)
- NEXT →: advance to next song in the list.
- Key Up (♯): raise key by 1 semitone; Reset Key: revert to original.
- Theme: toggles light/dark (persists via existing theme utilities).
- Font Size A−/A+: manual override (persists); use page reload to re‑enable auto‑fit.
- Chords On/Off toggle.

Navigation
- Mobile/tablet: swipe left = NEXT, swipe right = PREV.
- Desktop: Arrow Right/Left keys.

Persistence
- Theme: `gracechords.theme` (via `src/utils/app/theme.js`).
- Worship settings: `worship:transpose`, `worship:showChords`, `worship:fontSize`.

Notes
- Worship Mode hides the site navbar for clarity (route is outside the shared `Layout`).
- Uses the same chord rendering approach as SongView for alignment.
- Keep song IDs and filenames up to date by running `npm run build-index` after adding songs.

## Admin & Index Generation
Set the admin password via an environment variable and open `/admin` to author songs in ChordPro. Use Stage to queue changes; you can either publish a PR or download a ZIP of staged files.

```bash
VITE_ADMIN_PW=your-password # in .env
npm run build-index
```

Add `VITE_ADMIN_PW` to a local `.env` file for development and configure the same variable as a GitHub repository secret so builds receive it.

Admin highlights:
- Load an existing song from the index, edit in place, and Stage to queue changes.
- “Edits Author” is required when publishing — your name is appended to the PR body.
- Publish Staged opens a PR with staged files; Download Staged saves a ZIP for manual copy.
- Quick chord buttons insert `[C]`, `[Am]`, etc., at the caret; buttons adapt to the song’s key (I, ii, iii, IV, V, vi).

Manual publish (no PR):
1) Stage → Download Staged → unzip → copy to `public/songs/` → `npm run build-index` → `npm run build`.

## Song Translations
GraceChords supports separate `.chordpro` files per language variant.

- Link variants with `{song_id: <shared-id>}`.
- Mark file language with `{lang: <code>}` (`en`, `tr`, `ar`, `es`).
- If `{lang: ...}` is omitted, language defaults to English (`en`).
- Translation titles can differ from English titles. Matching is by `song_id`, not by title text.

Example:
```chordpro
{title: Send Us Lord}
{song_id: send-us-lord}
{lang: en}
```

```chordpro
{title: Rab Bizi Gonder}
{song_id: send-us-lord}
{lang: tr}
```

Default and persistence behavior:
- Song language defaults from UI/browser locale when possible.
- User override is saved in `localStorage` under `pref:songLanguage`.
- The same preference is reused across Song Library, SongView, Setlist, Songbook, Home suggestions, and Worship Mode resolution.

Metadata inheritance behavior:
- For each `song_id` group, English is treated as master/source of truth when present.
- Translations inherit `key`, `tags`, `authors`, `country`, `youtube`, `mp3`, and `pptx` unless the translation sets a non-empty value for that field.
- Blank values in translation files still inherit from English.

Song Library behavior:
- Language chips appear only for languages that have at least one real translation group.
- Results are sorted in two blocks:
  - songs with selected-language translation (A-Z)
  - songs without selected-language translation (A-Z), under "No Translation in Selected Language"
- Search matches alternate titles/tags/authors across all variants in a group.

## Resources (Guides/Articles)
GraceChords includes a lightweight resources/blog system for worship teams.

- Content lives in `public/resources/*.md` with YAML-style frontmatter:

  ```md
  ---
  title: "Leading Worship with Confidence"
  author: "Ryan Moore"
  date: "2025-09-10"
  tags: ["leadership", "vocals"]
  summary: "Practical tips for worship leaders."
  ---

  # Heading
  Markdown content…
  ```

- Index page: `/resources` — grid of cards, search (title/summary, falls back to content), tag filters.
- Post page: `/resources/:slug` — renders Markdown with support for images, links, blockquotes, lists, headings, code, and raw HTML embeds (e.g., YouTube iframes).
- Admin editor: `/admin/resources` — create/edit posts with live preview and PR publishing (uses the same GitHub token flow as songs). Requires the “Edits Author” field.

Build & CI
- Rebuild resources index after adding/editing `.md` files:
  ```bash
  npm run build-resources-index
  ```
- CI automation: see “CI & Automation” section (below) for the single unified workflow that rebuilds indexes, sitemap, docs, and Telegram posts when needed.

## PDF Fonts
Place the following font files in `src/assets/fonts/` so the PDF exporter can bundle them (they are imported with `?url` and registered at runtime):
- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`
- `NotoSans-Italic.ttf`
- `NotoSans-BoldItalic.ttf`
- `NotoSansMono-Regular.ttf`
- `NotoSansMono-Bold.ttf`

These fonts cover multilingual glyphs used in translated charts, including Turkish characters.

## Normalization
Keep filenames consistent and avoid duplicates before building the index:

```bash
npm run normalize
npm run build-index
```

The normalizer converts hyphens/spaces to underscores (e.g., `all-in-all.chordpro` → `all_in_all.chordpro`) and, when both forms exist, keeps the underscore file and deletes the hyphen one. It also copies/renames PPTX from `TO_RENAME/` to `public/pptx/` with normalized names.

## Disclaimer Controls
Set `VITE_ENABLE_DISCLAIMER=0` to disable the site footer, ChordPro comment block appending, and PDF footers. Optionally set `VITE_CONTACT_EMAIL=you@example.com` to append a contact line in site/ChordPro disclaimers.

## Importing Lyrics (DOCX/PDF/Images → ChordPro)
Recommended: use the standalone ingest CLI under `scripts/ingest/` (supports DOCX/PDF/images + OCR, staging, normalization, and compare reports).

```bash
cd scripts/ingest
npm i
npm run build

# drop sources into scripts/ingest/_ingest_inbox and run:
npx gc-ingest

# or ingest a single file
npx gc-ingest ingest /path/to/song.pdf

# ingest a multi-song PDF songbook (bilingual-aware splitter)
npx gc-ingest ingest-songbook /path/to/songbook.pdf
```

Legacy: Convert documents into a ChordPro skeleton with section blocks. Default output uses short ChordPro directives.

```bash
# DOCX → ChordPro (directives default)
npm run ingest -- path/to/song.docx

# PDF → ChordPro (default output: public/songs)
npm run ingest -- path/to/song.pdf

# Plain headers instead of directives
npm run ingest -- path/to/song.pdf --plain
```

Notes
- The ingest CLI writes staged output under `scripts/ingest/_ingest_staging/<slug>/` with draft/normalized outputs and HTML previews.
- `ingest-songbook` is designed for large multi-page PDFs: it keeps page order, ignores cover/TOC-style pages, and splits numbered Turkish/English song pairs into separate staged songs when detected.
- Songbook ingest also maps Turkish section markers (`[KITA]`, `[NAKARAT]`, `[KÖPRÜ]`) to standard ChordPro section directives and normalizes titles to Title Case while keeping the song number.
- Optional deps: `mammoth` for DOCX, `pdf-parse` for PDF.
- Default wraps sections using `{sov|soc|sob}` / `{eov|eoc|eob}`; `--plain` emits readable headers (e.g., `Verse 1`, `Pre‑Chorus`).
- Output directory must exist. By default it is `public/songs`. Use `--out <dir>` to override.
- If the target filename already exists, the tool interactively asks to Overwrite, Rename, Skip, or Abort.
- After import: `npm run normalize && npm run build-index`.
- The tool strips a leading title duplicate and recognizes lines like `(Key of G)` to populate `{key: G}` while removing the line from lyrics. Pure chord-only lines are ignored.
- Output filenames use underscores by default (e.g., `above_all.chordpro`).

## CI & Automation
- Single workflow: `.github/workflows/automation.yml` runs on pushes to `main` (and manual dispatch) and decides what to do based on changed files.
  - Telegram (opt-in): send only when the commit message contains `#post`/`#announce` (`[post]`/`[announce]` also work). Skips if Telegram secrets are missing.
  - Wiki: if `public/wiki/**` changes, runs `scripts/syncWiki.mjs` (needs `WIKI_PUSH_TOKEN`).
  - Indexes: if `public/songs/**` or `scripts/buildIndex.mjs` change, runs `npm run build-index`. If `public/resources/**` or `scripts/buildResourcesIndex.mjs` change, runs `npm run build-resources-index`.
  - Sitemap: runs `npm run generate:sitemap` when song/resource data or sitemap script changes.
  - Build: runs `npm run build` with `VITE_COMMIT_SHA=${{ github.sha }}` when code or generated data/sitemap changed.
  - Commit: stages `docs/`, `src/data/*.json`, and `public/sitemap.xml`/`public/robots.txt` into a single commit (`chore: automation for <sha>`).
  - Concurrency: one automation run per branch (`automation-${ref}`), canceling in-progress duplicates.
- Bot-origin pushes are ignored to avoid loops.

**PDF Export (MVP Engine)**
- **Engine:** single-song, setlist, and songbook exporters live at `src/utils/pdf_mvp/` (facade: `src/utils/pdf/`).
- **Decision ladder:** 1-col single page at sizes `16 → 12` pt; else 2-col at `16 → 12` pt; else 1-col multipage at 15 pt (header only on page 1).
- **Typography:** Title 26 pt bold; Key 16 pt italic gray (`rgb(90,90,90)`); lyrics/chords 12–16 pt with ~1.2× line-height; section headers same size as lyrics (bold).
- **Chords:** appear above the exact lyric character; no overlaps (≥ one space width); trailing chords flush to end.
- **Sections:** never split across columns/pages; compact, consistent spacing.
- **Songbook TOC:** entries show “#. Title” (no page numbers). Defaults to one column; switches to two before spilling to a second page; continued pages use two columns. Default cover shows “GraceChords Songbook” + date.
- **Tests:** run `npm run test:mvp` to guard column/size/page decisions, chord alignment, header spacing.
- See `src/utils/pdf_mvp/README.md` and the wiki page for details.

## PPTX Slides
Place PowerPoint lyric decks in `public/pptx/` named after the song's file name without the `.chordpro` extension.
For example, a song stored as `public/songs/glorious-king.chordpro` can have slides at `public/pptx/glorious-king.pptx`.
Files committed under `public/` are served directly by GitHub Pages, so adding a PPTX is as simple as dropping it in this directory and committing.

## Offline Support
GraceChords registers a service worker to make core assets available offline. During the install event it pre-caches the app shell (`index.html`), the song index, and bundled fonts. At runtime the worker caches additional scripts, styles, fonts, documents, assets under `/assets/` or `/src/data/`, and individual song files as they are fetched.

The cache name includes a commit hash from the `VITE_COMMIT_SHA` environment variable so that each deployment invalidates older caches. Set it when building to force clients to fetch the latest files, for example:

```bash
VITE_COMMIT_SHA=$(git rev-parse HEAD) npm run build
```

During development you can disable the worker by commenting out its registration in `index.html` or by unregistering via the browser console:

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
```

Song files (`/songs/**`) and the index (`/src/data/index.json`) are fetched with a network‑first strategy so edits appear promptly after deploy. To pick up changes without a full rebuild, call `navigator.serviceWorker.getRegistration().then(r => r.update())` or clear cached data.

## Usage Notes
- **Home**: search and tag filters, select-all/clear, per-song key, bundle builder at `/bundle`.
- **Song page**: vertical layout, sticky toolbar (transpose & download), chord toggle (on by default), 1/2‑column reading view, collapsible media.
- **Editor shortcut**: floating pencil button (bottom-right) opens the editor. On song/resource pages it preloads that item; on the song/resources list it starts a new entry of that type; elsewhere it opens a new song draft.
- **Setlist**: `/setlist` lets you build/reorder sets, choose keys, save/load by name (modal), share a link, and export PDF/PPTX. Headers are sticky within each pane; panes scroll independently.
- **Songbook**: builder mirrors Setlist layout and width; sticky header with inline search and “Add all”. Export always includes a TOC; optional cover image.
- **PDFs**: vector text with Noto Sans; sections stay together; layout auto‑switches to two columns when needed.

## Sorting & Index
- The index builder ignores files prefixed with `test_*.chordpro`.
- Sorting places numeric titles first; otherwise titles are compared case‑insensitively, ignoring leading punctuation (e.g., `'Tis` sorted under `T`).

## Next Steps
Explore utilities in `src/utils` for chord transposition and PDF generation, check `scripts/buildIndex.mjs` for index creation, and extend Vitest tests to safeguard future refactors.

## GitHub Wiki

Author or edit Markdown pages under `public/wiki/` (e.g., `Home.md`, `_Sidebar.md`, etc.).
Set the repo secret `WIKI_PUSH_TOKEN` (a classic PAT with `repo` scope) to allow pushes to `GraceChords.wiki`.
Trigger sync by pushing changes under `public/wiki/**` (workflow runs) or run locally:

```bash
WIKI_PUSH_TOKEN=<your_PAT> node scripts/syncWiki.mjs
```

If pages don’t appear, run the diagnostic:

```bash
node scripts/verifyWikiSetup.mjs
```
