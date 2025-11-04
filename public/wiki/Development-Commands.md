Common commands for development, testing, indexing, and maintenance.

## App
- `npm ci` — install exact dependencies
- `npm run dev` — start Vite dev server (`http://localhost:5173`)
- `npm run build` — build static site into `docs/`
- `npm run preview` — preview the production build locally

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
- `npm run ingest -- <file...>` — import DOCX/PDF/TXT to ChordPro skeleton (see [[Importing-Lyrics]])
- `npm run convert:short` — convert existing songs to short directive style
- `npm run repair:meta` — repair or fill common metadata fields across songs

## Environment
- `.env` — set `VITE_ADMIN_PW=your-password`
- Optional: `VITE_COMMIT_SHA=$(git rev-parse HEAD)` when building to bust caches

## Stats
- `npm run stats` — print counts of files, total lines, and characters (excludes `docs/`, `node_modules/`, and `.git/`)

[[Getting-Started]] [[Project-Structure]] [[Index-Building]]
