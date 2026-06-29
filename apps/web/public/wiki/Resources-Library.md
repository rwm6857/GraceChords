# Resources Library

GraceChords hosts a resource library for guides, tutorials, and blog-style posts. Content is stored in the Supabase `posts` table.

## Index page
- URL: `/resources`
- Sorting: newest → oldest by `published_at`.
- Tag chips: click a tag to filter; click **All** to clear.
- Search: Fuse.js searches titles and excerpts.

## Post pages
- URL pattern: `/resources/:slug`
- Metadata: title, excerpt, author display name, date, and tags render above the article body.
- Related reading: up to three related posts selected by tag intersection.
- Canonical links and OG tags for SEO.

## Content format
Posts are rows in `public.posts`:

| Column | Description |
|--------|-------------|
| `title` | Post title |
| `slug` | URL-safe slug (e.g. `worship-with-confidence`) |
| `content` | Rich HTML body (authored in Tiptap editor) |
| `excerpt` | Short summary shown on index cards |
| `featured_image_url` | Cloudinary or other image URL |
| `tags` | JSON array of tag strings |
| `status` | `draft` or `published` |
| `published_at` | ISO timestamp set on first publish |
| `author_id` | FK to `public.users` |

## Editing posts
Use the editor at `/portal/posts` (requires editor role). See [[Admin-Resources]] for the authoring workflow.
