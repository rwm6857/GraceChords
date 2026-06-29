Developer notes for the minimal, reliable single‑song PDF exporter.

## Location & Entry Points
- Code: `src/utils/pdf_mvp/`
- Entry: `downloadSingleSongPdf(song)` and `planSingleSong(song)`
- Facade: `src/utils/pdf/` integrates single/multi‑song exports

## Decision Ladder
1) 1‑column, single page at sizes 16 → 12 pt
2) 2‑column, single page at sizes 16 → 12 pt
3) Fallback: 1‑column multipage at 15 pt (title/key header only on page 1)

## Typography & Spacing
- Title: 26 pt, bold; wraps as needed
- Key: 16 pt, italic gray (`rgb(90,90,90)`), tight under title
- Lyrics: 12–16 pt, line‑height ≈ 1.2×
- Section headers: same size as lyrics (bold), rendered as `[LABEL]`
- Header gap: ≈ 1.125× lyric line‑height before first section

## Chords
- Drawn on their own line above the wrapped lyric line
- Align above the exact lyric characters they precede
- Enforce ≥ one space width between successive chords; nudge minimally
- Trailing chords flush to end‑of‑line with a single‑space separation

## Columns & Paging
- Page margins: 0.5" on all sides
- Two columns use a 24 pt gutter and equal widths
- Sections are atomic and never split across columns/pages

## Fonts
- Preferred: Noto Sans (Regular/Italic/Bold) and Noto Sans Mono (Regular/Bold)
- Place font files under `src/assets/fonts/` (imported with `?url` and registered at runtime)
- Falls back to jsPDF built‑ins (`helvetica`/`courier`) if Noto is unavailable

## Tests
- Run: `npm run test:mvp`
- Suites: `pdf_mvp.plan.test.js`, `pdf_mvp.chords.test.js`, `pdf_mvp.sections.test.js`

## Do Not Regress
- Title 26 pt; Key 16 pt gray; lyric/chord 12–16 pt; line‑height ≈ 1.2×
- Minimal 1‑space chord separation; chords align over matching lyric characters
- Sections never split; header gap ≈ 1.125× lyric line

See also [[PDF-and-Printing]].

