# Resources Library

GraceChords hosts a resource library for guides, tutorials, and blog-style posts. Content is stored in the Supabase `posts` table.

## Index page
- URL: `/posts` (the old `/resources` URLs 301 here via `public/_redirects`)
- Sorting: newest → oldest by `published_at`.
- Tag chips: click a tag to filter; click **All** to clear.
- Search: case-insensitive text match on titles and excerpts.

## Post pages
- URL pattern: `/posts/:slug`
- Metadata: tags, title, excerpt, and date ("Updated …" when edited after publishing) render above the article body.
- SEO: the build-time static shell carries a canonical link; an `og:image` tag is added when a featured image is set.

## Content format
Posts are rows in `public.posts`:

| Column | Description |
|--------|-------------|
| `title` | Post title |
| `slug` | URL-safe slug (e.g. `welcome_to_gracechords`) |
| `content` | Rich HTML body (authored in Tiptap editor) |
| `excerpt` | Short summary shown on index cards |
| `featured_image_url` | Cloudinary or other image URL |
| `tags` | Array (`text[]`) of tag strings |
| `status` | `draft` or `published` |
| `published_at` | ISO timestamp set on first publish |
| `author_id` | FK to `public.users` |

## Editing posts
Use the editor at `/portal/posts` (requires editor role). See [[Admin-Resources]] for the authoring workflow.
