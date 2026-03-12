Common commands for development, testing, indexing, and maintenance.

## App
- `npm ci` — install exact dependencies
- `npm run dev` — start Vite dev server (`http://localhost:5173`)
- `npm run build` — build static site into `docs/`
- `npm run preview` — preview the production build locally
- `npm run build:bibles` — ingest all XML files from `BIBLE_XML/` into `public/bible/<lang>/<id>/` and update `public/bible/translations.json` (overwrites existing translation folders)
- `npm run build:bible -- --xml ./BIBLE_XML/FILE.xml` — ingest one XML translation (header metadata sets id/lang/label/name by default)

## Tests
- `npm test` — run vitest
- `npm run test:watch` — watch mode
- `npm run test:mvp` — run PDF MVP engine safeguards (layout, chords, sections)

## Songs & Index
- `npm run normalize` — normalize song/PPTX filenames (underscores) and copy `TO_RENAME/*.pptx` to `public/pptx/`
- `npm run build-index` — generate `src/data/index.json` from `public/songs/`

## Resources (Blog)
- `npm run build-resources-index` — generate `src/data/resources.json` from `public/resources/`

## Import & Repair Utilities
- `npx gc-ingest` — ingest inbox (`scripts/ingest/_ingest_inbox/`) with staging output
- `npx gc-ingest ingest <file>` — ingest a single PDF/DOCX/image
- `npx gc-ingest compare` — compare staged output to `public/songs/`
- `npm run ingest -- <file...>` — legacy DOCX/PDF/TXT import (see [[Importing-Lyrics]])

See [[Ingestion-CLI]] for full usage and reports.
- `npm run convert:short` — convert existing songs to short directive style
- `npm run repair:meta` — repair or fill common metadata fields across songs

## SEO
- `npm run generate:sitemap` — regenerate `public/sitemap.xml` (top-level routes + all songs/resources)
- `node scripts/generate-seo-pages.mjs` — generate static SEO pages into `docs/` (runs during `npm run build`)

## Environment
- `.env` — set `VITE_ADMIN_PW=your-password`
- Optional: `VITE_COMMIT_SHA=$(git rev-parse HEAD)` when building to bust caches

## Stats
- `npm run stats` — print counts of files, total lines, and characters (excludes `docs/`, `node_modules/`, and `.git/`)

[[Getting-Started]] [[Project-Structure]] [[Index-Building]]
