## Admin: Resources

The admin resources editor lets you create and publish blog-style guides for worship teams.

- Open: `/admin/resources` (same admin password as songs)
- Requires: a GitHub token (repo scope) set in the browser via the “Set token” action

### Workflow

1. Create or load a post
   - Existing posts are listed at the top (from the generated `resources.json` index).
   - Click “New Post” to start a blank article.
2. Fill metadata
   - Title, Author, Date, Tags (comma-separated), Summary; Slug is auto-derived from Title and can be edited.
3. Write content
   - The left textarea accepts Markdown; the right panel shows a live preview.
4. Stage & Publish
   - Click “Stage” to prepare the `.md` file.
   - Enter your name in the “Edits Author” field (required; appended to PR body).
   - Click “Publish” to open a pull request with changes under `public/resources/`.

### Metadata

Each post must include frontmatter:

```md
---
title: "Post Title"
author: "Your Name"
date: "YYYY-MM-DD"
tags: ["tag1", "tag2"]
summary: "One-line summary shown on the card."
---
```

### CI: Resources Index

- On changes to `public/resources/*.md`, the workflow `update-resources.yml` runs:
  - Executes `scripts/buildResourcesIndex.mjs`
  - Commits `src/data/resources.json`
  - That commit triggers the site build workflow to publish changes to `docs/`.

### Tips

- Embeds: You may include raw HTML iframes to embed videos (YouTube/Vimeo).
- Images: Place absolute URLs or files hosted elsewhere; content under `public/resources/` is served as-is.
- Slugs: Use short, kebab-case slugs for stable URLs.
