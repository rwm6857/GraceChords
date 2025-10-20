PDF Engine Functionality

This document summarizes the approved single‑song PDF export behavior used by GraceChords and points to the canonical references.

Purpose
- Produce clean, legible lead sheets from `.chordpro` songs with predictable layout rules.

Highlights
- Prioritize fitting on a single page; choose the largest readable size
- Sections are atomic — never split across columns or pages
- Title and key appear at the top (title 26 pt bold; key 16 pt italic gray)
- Chords are drawn above lyrics with exact alignment and no symbol overlaps
- Two columns are used when beneficial; margins are 0.5" with a 24 pt gutter

Decision Ladder
1) 1‑column, single page at sizes 16 → 12 pt
2) 2‑column, single page at sizes 16 → 12 pt
3) Fallback: 1‑column multipage at 15 pt (title/key header only on page 1)

Fonts
- Preferred: Noto Sans (Regular/Italic/Bold) and Noto Sans Mono (Regular/Bold)
- Place font files in `src/assets/fonts/` (the exporter imports them with `?url` and registers via jsPDF)

Developer References
- PDF MVP README: `src/utils/pdf_mvp/README.md`
- Tests: `src/__tests__/pdf_mvp.*.test.js` (run with `npm run test:mvp`)
- Wiki: PDF user guide at `public/wiki/PDF-and-Printing.md` and developer notes at `public/wiki/PDF-Engine-(MVP).md`

See also
- ChordPro directives: https://www.chordpro.org/chordpro/chordpro-directives
- PDF configuration (ChordPro): https://www.chordpro.org/chordpro/chordpro-configuration-pdf
