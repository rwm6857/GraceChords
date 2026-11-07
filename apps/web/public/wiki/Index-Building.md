How song and post data flows from Supabase to the app and SEO assets.

## Runtime data (app)
Songs and posts are served directly from Supabase at runtime — there is no local JSON index required for the app to run.

- **Songs** — `useSongs.jsx` queries `public.songs` from Supabase and caches the list in memory (revalidating in the background after 5 minutes). Lyrics are fetched per song on demand.
- **Posts** — `usePosts.jsx` queries `public.posts` from Supabase.
- **Search** — `SongsPage` runs an in-memory word-prefix search (`src/utils/songs/search.js`) over titles, tags, and authors.

## Build-time SEO data
`npm run build` runs two scripts that need Supabase data to generate static HTML:

- `scripts/generate-seo-pages.mjs` — queries songs and posts via the service role key to create static HTML shells for `/songs/:slug` and `/posts/:slug` (so crawlers can index content before JS runs)
- `scripts/generate-sitemap.mjs` — queries songs and posts to write `dist/sitemap.xml`

Both scripts require `SUPABASE_SERVICE_ROLE_KEY` set in the environment.

## Translation grouping
The `songs` table has a `song_group_id` column for translation families, but grouping is not yet wired: `useSongs` treats every song as its own English entry, so language chips do not currently appear in the app.

## Sorting rules
- Titles beginning with digits are listed first.
- For other titles, leading punctuation is ignored (`'Tis So Sweet…` sorts under `T`).
- Sorting is case-insensitive.
- When a language is selected, songs with a variant in that language appear first (A→Z), then songs without (A→Z).

[[Project-Structure]] [[Build-and-Deploy]]
