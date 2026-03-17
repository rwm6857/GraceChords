Common commands for development, testing, and maintenance.

## App
- `npm ci` — install exact dependencies
- `npm run dev` — start Vite dev server (`http://localhost:5173`)
- `npm run build` — build to `dist/`, then generate SEO pages and sitemap (requires `SUPABASE_SERVICE_ROLE_KEY`)
- `npm run preview` — preview the production build locally (`http://localhost:4173`)

## Tests
- `npm test` — run Vitest
- `npm run test:watch` — watch mode
- `npm run test:run` — single run (CI mode)
- `npm run test:mvp` — run PDF MVP engine layout/chord/section guards

## Bible data
- `npm run build:bible -- --xml ./BIBLE_XML/FILE.xml` — ingest one XML translation into `public/bible/<lang>/<id>/` and update `public/bible/translations.json`

## SEO
- `npm run generate:sitemap` — regenerate `public/sitemap.xml` (requires `SUPABASE_SERVICE_ROLE_KEY`)

## Song utilities
- `npm run convert:short` — batch-convert existing songs to short ChordPro directive style

## Bundle analysis
- `ANALYZE=1 npm run build` — generates `dist/stats.html` (treemap of bundle chunks)

## Environment
Set `VITE_COMMIT_SHA=$(git rev-parse HEAD)` before `npm run build` to embed the commit hash in the service worker cache name and bust stale caches on deploy.

[[Getting-Started]] [[Project-Structure]] [[Build-and-Deploy]]
