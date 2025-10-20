## Resources (Guides/Articles)

GraceChords includes a lightweight resources/blog section for worship teams.

- Index: `/#/resources`
- Post: `/#/resources/:slug`

### Content Format

Posts are Markdown files under `public/resources/` with YAML-style frontmatter:

```md
---
title: "Leading Worship with Confidence"
author: "Ryan Moore"
date: "2025-09-10"
tags: ["leadership", "vocals", "confidence"]
summary: "Practical tips for overcoming stage fear and leading with clarity."
---

# Heading
Markdown content…
```

Supported in content: images, links, headings, lists, blockquotes, inline and fenced code, and raw HTML embeds (e.g., YouTube iframes).

### Index Page

- Shows cards with Title, Author, Date, Tags, Summary.
- Sorts newest → oldest.
- Search bar filters by Title/Summary and falls back to full-content search when needed.
- Tag chips filter by a single tag; click “All” to clear.

### Post Page

- Renders the Markdown body as a styled article.
- Displays metadata at the top.
- Shows up to 3 related posts based on shared tags.

### Admin Editor

See [[Admin-Resources]] for creating/editing posts and publishing changes.

### CI: Resources Index

On changes under `public/resources/*.md`, the workflow `update-resources.yml` rebuilds `src/data/resources.json` and commits it to `main`. That commit triggers the site build to publish updates to `docs/`.
