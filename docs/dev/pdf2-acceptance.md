# PDF2 Acceptance

This checklist captures the manual verification required before retiring the legacy PDF engine.

## Manual rendering checks

### SongView
- Open any song in **SongView** and export a PDF using `pdf2`.
- Confirm lyrics, chords, pagination, and fonts render as expected.

### Setlist
- Build a small **Setlist** and render to PDF.
- Verify each song starts on a new page and footers/headers look correct.

### Songbook
#### Without cover & TOC
- Render a **Songbook** without a cover page or table of contents.
- Ensure all songs appear in order and pagination is consistent.

#### With cover & TOC
- Render a **Songbook** including a cover page and table of contents.
- Check the cover displays, TOC entries link to the right pages, and page numbers match.

### Tracing
- Enable tracing (e.g. append `?trace` or set `TRACE=1`).
- Confirm a planning trace file is produced alongside the PDF and reflects rendering decisions.

## Automated checks
- `npm test src/utils/pdf2/__tests__/planner.spec.js` – planner invariants.
- `npm test src/utils/pdf2/__tests__/render.spec.js` – renderer smoke test.

## Flipping engines
Once `pdf2` is proven, retire the legacy engine:
1. Remove `src/utils/pdf`.
2. Rename `src/utils/pdf2` to `src/utils/pdf`.
3. Update imports accordingly.
