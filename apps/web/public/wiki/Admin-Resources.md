## Admin: Resources

The resources editor lets you create, edit, and publish blog-style guides for worship teams. Posts are stored in Supabase and edited via the Tiptap rich-text editor.

- Route: `/portal/posts`
- Requires: editor role or above

### Workflow

1. **Open the editor**
   - Navigate to `/portal/posts`.
   - Existing posts are listed with their status (`draft` / `published`).
   - Click **New Post** for a blank draft or click an existing post to edit it.

2. **Fill metadata**
   - Title, slug (auto-derived from title, editable), excerpt, tags (comma-separated), featured image URL.

3. **Write content**
   - Use the Tiptap editor — supports headings, lists, links, images, YouTube embeds, code blocks.
   - Images can be hosted on Cloudinary; use the image upload button to upload and insert automatically.

4. **Save or publish**
   - **Save Draft** — saves without publishing (status: `draft`).
   - **Publish** — sets status to `published` and records `published_at` if this is the first publish.

5. **Delete**
   - Click **Delete** to permanently remove the post from Supabase (admin+ only).

### Tips

- **Slugs**: Use short, kebab-case slugs for stable URLs (e.g., `leading-with-confidence`).
- **Images**: Upload to Cloudinary via the editor image button; this returns a CDN URL inserted inline.
- **Embeds**: Paste a YouTube URL directly in the editor; the YouTube extension converts it to an embed.
- **Draft review**: Posts with `status = draft` are not visible on the public `/resources` page.

### Related

[[Resources-Library]] [[Roles-and-Access]] [[Admin-Portal]]
