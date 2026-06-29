How song and post data flows from Supabase to the app and SEO assets.

## Runtime data (app)
Songs and posts are served directly from Supabase at runtime — there is no local JSON index required for the app to run.

- **Songs** — `useSongs.jsx` queries `public.songs` from Supabase and caches the result for the session.
- **Posts** — `usePosts.jsx` queries `public.posts` from Supabase.
- **Search** — `SongsPage` passes the Supabase results to Fuse.js for in-memory fuzzy search.

## Build-time SEO data
`npm run build` runs two scripts that need Supabase data to generate static HTML:

- `scripts/generate-seo-pages.mjs` — queries songs and posts via the service role key to create static HTML shells for `/songs/:slug` and `/resources/:slug` (so crawlers can index content before JS runs)
- `scripts/generate-sitemap.mjs` — queries songs and posts to write `public/sitemap.xml`

Both scripts require `SUPABASE_SERVICE_ROLE_KEY` set in the environment.

## Translation grouping
Songs can be grouped into translation families by sharing the same `song_group_id` in the `songs` table (equivalent to `{song_id: ...}` in ChordPro). Language chips in the app only appear when at least one real translation group exists (two or more songs sharing a `song_group_id`).

## Sorting rules
- Titles beginning with digits are listed first.
- For other titles, leading punctuation is ignored (`'Tis So Sweet…` sorts under `T`).
- Sorting is case-insensitive.
- When a language is selected, songs with a variant in that language appear first (A→Z), then songs without (A→Z).

[[Project-Structure]] [[Build-and-Deploy]]
