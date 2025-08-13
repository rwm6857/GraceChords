# GraceChords

GraceChords is a React + Vite single-page application for managing and playing a ChordPro songbook. It supports fast search, chord transposition, setlist building, and PDF exports for practice or performance.

## Features
- 🔍 Instant search with tag filters
- 🎸 Song view with key transposition, chord toggling, and single-song PDF download
- 📋 Setlist builder for reordering and transposing multiple songs with multi-song PDF export
- 📦 Bundle download for predefined groups of songs
- 🛠️ Admin interface for authoring songs and rebuilding the index
- 🌓 Light/dark theme toggle and keyboard shortcuts (`c`, `[`, `]`)

## Project Structure
```
src/            # components, hooks, utilities, tests
public/         # ChordPro files and font assets
scripts/        # maintenance scripts (e.g., index generation)
docs/           # Vite build output for GitHub Pages
```

## Installation
```bash
npm install
npm run dev
```

Visit `http://localhost:5173` (default Vite port) to explore the app.

## Building & Deployment
Generate the static site into `docs/` and push to the `main` branch to serve via GitHub Pages:
```bash
npm run build
# commit & push -> serve from /docs
```

Routing uses hash fragments (`/#/...`) so deep links work on static hosting.

## Admin & Index Generation
Set the admin password via an environment variable and open `/#/admin` to author songs in ChordPro and download a bundle containing the song and updated index. Add files to `public/songs/` and merge `src/data/index.json`, or rebuild automatically:

```bash
VITE_ADMIN_PW=your-password # in .env
npm run build-index
```

Add `VITE_ADMIN_PW` to a local `.env` file for development and configure the same variable as a GitHub repository secret so builds receive it.

## PDF Fonts
Place the following fonts in `public/fonts/` to embed them in exported PDFs:
- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`
- `NotoSans-Italic.ttf`
- `NotoSans-BoldItalic.ttf`
- `NotoSansMono-Regular.ttf`
- `NotoSansMono-Bold.ttf`

## PPTX Slides
Place PowerPoint lyric decks in `public/pptx/` named after the song's file name without the `.chordpro` extension.
For example, a song stored as `public/songs/glorious-king.chordpro` can have slides at `public/pptx/glorious-king.pptx`.
Files committed under `public/` are served directly by GitHub Pages, so adding a PPTX is as simple as dropping it in this directory and committing.

## Usage Notes
- **Home**: search and tag filters, select-all/clear, per-song key, bundle builder at `/bundle`.
- **Song page**: vertical layout, sticky toolbar (transpose & download), chord toggle (on by default), collapsible media.
- **Setlist**: `/setlist` lets you build/reorder sets, choose keys, and export a single PDF.
- **PDFs**: vector text with Noto Sans; section titles are bold and larger; sections stay together; layout auto-switches to two columns when needed.

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
