# Resources Library

GraceChords hosts a lightweight resource library for guides, tutorials, and blog-style posts. The React Resources page pulls from `src/data/resources.json` and the Markdown files under `public/resources/`.

## Index behavior
- URL: `/resources`.
- Sorting: items are sorted newest → oldest using the ISO date string in each item.
- Tag chips: a single tag filter is enforced; click **All** to clear. Chips are derived from all tag values in the dataset.
- Search: the search box uses Fuse.js against titles and summaries. If those matches return empty results, it lazily loads the Markdown files and performs a fallback full-body search to catch content matches.

## Post pages
- URL pattern: `/resources/:slug`.
- Metadata: titles, summaries, authors, dates, and tags render above the article content.
- Related reading: up to three related posts are selected by intersecting tags from frontmatter and the index entry.
- Canonical links: `<link rel="canonical">` and OG tags use the clean path format for SEO and sharing.

## Content format
- Each post is a Markdown file with YAML frontmatter (`title`, `author`, `date`, `tags`, `summary`).
- Body content supports headings, lists, inline and fenced code blocks, blockquotes, images, and embedded HTML (e.g., YouTube iframes).
- Posts live under `public/resources/`; slugs map directly to filenames (e.g., `my-post.md`).
