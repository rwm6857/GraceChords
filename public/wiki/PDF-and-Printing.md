Learn how GraceChords renders charts and songbooks for print.

## At a glance
- Sections never split across pages
- Widow and orphan lines are tightened
- Supports single or multi-column layouts
- Embedded PDF fonts live in `src/assets/fonts/`
- Songbook TOC lists entries as "#. Title" (no page numbers); defaults to one column and switches to two columns before spilling to a second page

### Layout rules
Charts keep whole sections on one page. The engine adjusts spacing to avoid lonely first or last lines.

### Fonts
Place Noto Sans and Noto Sans Mono files in `src/assets/fonts/` to embed them in PDFs.

### Troubleshooting
If a section still splits, shorten lines or reduce font size.

[[Songbook-Builder]] [[Setlists]]

## MVP PDF Engine (Single Song)

- Engine location: `src/utils/pdf_mvp/` (wired via `src/utils/pdf/index.js`).
- Decision ladder:
  - 1 column, single page at sizes 16 → 12 pt
  - else 2 columns, single page at sizes 16 → 12 pt
  - else fallback: 1 column, multipage at 15 pt (title/key header only on page 1)
- Typography:
  - Title 26 pt bold (wraps as needed)
  - Key 16 pt italic gray (`rgb(90,90,90)`) directly under title
  - Lyrics/Chords 12–16 pt, line-height ≈ 1.2×
  - Section headers same size as lyrics (bold), `[LABEL]` style
- Spacing:
  - Clear header-to-song gap ≈ 1.125 lyric line-heights before first section
  - Compact, consistent spacing between sections
- Chords:
  - Drawn on a separate line above the wrapped lyric row, aligned by measured lyric substring widths
  - No overlaps; at least one space width between symbols
  - Trailing chords flush at end-of-line with single-space separation
- Columns & paging:
  - 0.5" margins; two columns with 24 pt gutter
  - Sections are atomic and never split across columns/pages

### Tests

- Run: `npm run test:mvp`
- Suites: `pdf_mvp.plan.test.js`, `pdf_mvp.chords.test.js`, `pdf_mvp.sections.test.js`

### Fonts & Caching

- Fonts: Noto Sans + Noto Mono preferred; falls back to helvetica/courier if not registered.
- Service worker: `/songs/**` and `/src/data/index.json` use network-first to pick up edits after deploy.
- Recommended: build with `VITE_COMMIT_SHA=$(git rev-parse HEAD)` to invalidate old caches.

See also [[PDF-Engine-(MVP)]] for developer notes.
