Common commands for development, testing, and maintenance. Run them from the repo root; commands marked *(web)* exist only in `apps/web/package.json`, so run them from `apps/web/` or add `-w @gracechords/web`.

## App
- `npm ci` — install exact dependencies
- `npm run dev` — start Vite dev server (`http://localhost:5173`)
- `npm run build` — build to `apps/web/dist/`, then generate SEO pages and sitemap (requires `SUPABASE_SERVICE_ROLE_KEY`)
- `npm run preview` — preview the production build locally (`http://localhost:4173`)

## Tests
- `npm test` — run Vitest
- `npm run test:watch` *(web)* — watch mode
- `npm run test:run` — single run (CI mode)
- `npm run test:mvp` — run PDF MVP engine layout/chord/section guards
- `npm run lint` — ESLint
- `npm run i18n:check` — web locale key parity

## Design tokens
- `npm run tokens:swift` — regenerate the committed Swift tokens for `apps/studio` from `packages/tokens/native.ts`
- `npm run tokens:swift:check` — fail if the Swift tokens have drifted (Node ≥ 22.18)

## Bible data
- `npm run build:bible -- --xml ./BIBLE_XML/FILE.xml` *(web)* — ingest one XML translation into `apps/web/public/bible/<lang>/<id>/` and update `public/bible/translations.json` (production Bible JSON is served from R2)

## SEO
- `npm run generate:sitemap` — regenerate `apps/web/dist/sitemap.xml` (requires `SUPABASE_SERVICE_ROLE_KEY`; normally run as part of `npm run build`)

## Song utilities
- `npm run convert:short` *(web)* — legacy: converts `.chordpro` files under `apps/web/public/songs/` to short directive style. That folder no longer exists (songs live in Supabase), so it has nothing to convert.

## Bundle analysis
- `ANALYZE=1 npm run build` — generates `dist/stats.html` (treemap of bundle chunks)

## Environment
Set `VITE_COMMIT_SHA=$(git rev-parse HEAD)` before `npm run build` to embed the commit hash in the service worker cache name and bust stale caches on deploy.

[[Getting-Started]] [[Project-Structure]] [[Build-and-Deploy]]
