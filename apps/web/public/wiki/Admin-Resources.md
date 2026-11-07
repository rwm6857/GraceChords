## Admin: Posts

The posts editor lets you create, edit, and publish blog-style guides for worship teams. Posts are stored in Supabase and edited via the Tiptap rich-text editor.

- Route: `/portal/posts`
- Requires: editor role or above

### Workflow

1. **Open the editor**
   - Navigate to `/portal/posts`.
   - Existing posts are listed with their status (`draft` / `published`), publish date, and tags.
   - Click **New post** for a blank draft or **Edit** on an existing post.

2. **Fill metadata**
   - Title, slug (auto-derived from title for new posts, editable), excerpt, tags (comma-separated), featured image URL.

3. **Write content**
   - Use the Tiptap editor — supports headings, lists, blockquotes, links, images, YouTube embeds.
   - Images can be hosted on Cloudinary; use the image upload button to upload and insert automatically.

4. **Save or publish**
   - Choose **Draft** or **Published** under **Status**, then click **Create post** (new) or **Save changes**.
   - `published_at` is recorded the first time a post is saved as published.

5. **Delete**
   - Click **Delete** in the post list to permanently remove the post from Supabase (admin+ only).

### Tips

- **Slugs**: Auto-derived slugs are lowercase with underscores (e.g., `leading_with_confidence`); keep them short for stable URLs.
- **Images**: Upload to Cloudinary via the editor image button; this returns a CDN URL inserted inline.
- **Embeds**: Use the **Embed YouTube video** toolbar button, or paste a YouTube URL directly in the editor.
- **Draft review**: Posts with `status = draft` are not visible on the public `/posts` page.

### Related

[[Resources-Library]] [[Roles-and-Access]] [[Admin-Portal]]
