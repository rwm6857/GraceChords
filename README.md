# GraceChords

GraceChords is a React + Vite single-page application for managing and playing a ChordPro songbook. It supports fast search, chord transposition, setlist building, and PDF exports for practice or performance.

## Features
- 🔍 Instant search with tag filters
- 🎸 Song view with key transposition, chord toggling, and single-song PDF download
- 📋 Setlist builder for reordering and transposing multiple songs with multi-song PDF export
- 📦 Bundle download for predefined groups of songs
- 🛠️ Admin interface for authoring songs and rebuilding the index
- 🌓 Light/dark theme toggle and keyboard shortcuts (`c`, `[`, `]`)
 - 🧭 SongView 1/2‑column reading view (site‑side)

## Project Structure
```
src/            # components, hooks, utilities, tests
public/         # ChordPro files and font assets
scripts/        # maintenance scripts (e.g., index generation)
docs/           # Vite build output for GitHub Pages
```

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
Generate the static site into `docs/` and push to the `main` branch to serve via GitHub Pages:
```bash
npm run build
# commit & push -> serve from /docs
```
Keep `docs/CNAME` (custom domain) and the root `404.html` (SPA fallback) when deploying.

Routing uses hash fragments (`/#/...`) so deep links work on static hosting.

## Admin & Index Generation
Set the admin password via an environment variable and open `/#/admin` to author songs in ChordPro and download a bundle containing the song and updated index. Add files to `public/songs/` and merge `src/data/index.json`, or rebuild automatically:

```bash
VITE_ADMIN_PW=your-password # in .env
npm run build-index
```

Add `VITE_ADMIN_PW` to a local `.env` file for development and configure the same variable as a GitHub repository secret so builds receive it.

Admin highlights:
- Load an existing song from the index, edit in place, and stage an “update” PR.
- Quick chord buttons insert `[C]`, `[Am]`, etc., at the caret; buttons adapt to the song’s key (I, ii, iii, IV, V, vi).

## PDF Fonts
Place the following fonts in `public/fonts/` to embed them in exported PDFs:
- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`
- `NotoSans-Italic.ttf`
- `NotoSans-BoldItalic.ttf`
- `NotoSansMono-Regular.ttf`
- `NotoSansMono-Bold.ttf`

## Normalization
Keep filenames consistent and avoid duplicates before building the index:

```bash
npm run normalize
npm run build-index
```

The normalizer converts hyphens/spaces to underscores (e.g., `all-in-all.chordpro` → `all_in_all.chordpro`) and, when both forms exist, keeps the underscore file and deletes the hyphen one. It also copies/renames PPTX from `TO_RENAME/` to `public/pptx/` with normalized names.

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
- **Setlist**: `/setlist` lets you build/reorder sets, choose keys, and export a single PDF.
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
