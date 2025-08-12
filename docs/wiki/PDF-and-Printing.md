# PDF and Printing

The PDF engine keeps charts clean and rehearsal-ready. Exports are available from [[SongView]], [[Setlists]], and [[Songbook-Builder]].

## Layout
- Adaptive 1–2 column planner
- **Never split a section:** a verse or chorus moves as a whole
- Embedded fonts: `Noto Sans` for lyrics, `Noto Sans Mono` for chords

## Multi-song Export
- [[Setlists]] bundle multiple songs into one PDF
- Choose 1 or 2 columns before exporting
- Songbook builder adds title and table of contents

## Troubleshooting Page Breaks
- Long sections may overflow; add a `{comment: repeat}` and split
- If fonts fail to embed, ensure `docs/fonts/` is deployed
- PDFs rely on browser PDF viewer; print issues often stem from its settings
