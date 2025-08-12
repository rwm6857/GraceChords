Learn how GraceChords renders charts and songbooks for print.

## At a glance
- Sections never split across pages
- Widow and orphan lines are tightened
- Supports single or multi-column layouts
- Embedded fonts live in `public/fonts`
- Songbook TOC page numbers are computed after layout

### Layout rules
Charts keep whole sections on one page. The engine adjusts spacing to avoid lonely first or last lines.

### Fonts
Place custom fonts in `public/fonts/` to embed them in PDFs.

### Troubleshooting
If a section still splits, shorten lines or reduce font size.

[[Songbook-Builder]] [[Setlists]]
