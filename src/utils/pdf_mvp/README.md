**PDF Export (MVP Engine)**

- **Scope:** Single-song PDF export with clean, legible lead sheets. Setlist/songbook can adopt this later.
- **Location:** `src/utils/pdf_mvp/`
- **Entry:** `downloadSingleSongPdf(song)` (wired via `src/utils/pdf/index.js`).

**Design Goals**
- **Readability-first:** Keep lyrics/chords large; fit on one page whenever possible.
- **Predictable layout:** Sections never split across columns/pages. Chords align over exact lyric characters.
- **Fast + robust:** No external layout deps; jsPDF fonts with safe fallbacks.

**Decision Ladder**
- **1-col single page:** try sizes `16 → 12` pt.
- **2-col single page:** try sizes `16 → 12` pt.
- **Fallback:** 1-col, multipage at 15 pt. Header only on page 1.

**Typography & Spacing**
- **Title:** 26 pt, bold, black; supports wrapping.
- **Key:** 16 pt, italic, gray `rgb(90,90,90)`; sits tightly under title.
- **Header → song gap:** clear gap ≈ `1.125 ×` lyric line-height before first section.
- **Lyrics:** 12–16 pt, `NotoSans` (fallback `helvetica`). Line-height ≈ `1.2 ×` font size.
- **Chords:** Mono bold (`NotoSansMono`, fallback `courier`), same size as lyrics. Drawn on a line above the matched lyric row with a tighter vertical gap.
- **Section headers:** Same size as lyrics, bold, `[LABEL]` style.
- **Section spacing:** Compact, consistent spacer between sections.

**Chord Placement Rules**
- **Absolute alignment:** Chords appear above the exact lyric character they precede in the source.
- **No overlap:** Successive chords separated by at least one “space” width, nudged minimally.
- **Trailing chords:** A run of chords at end-of-line sits flush to the lyric end with single-space separation.

**Columns & Paging**
- **Columns:** 0.5" page margins; two columns have a 24 pt gutter and equal widths.
- **Atomic sections:** A section always stays together within one column or page.
- **Fallback:** When single-page can’t fit (1-col or 2-col), render multiple pages at 15 pt, keeping sections intact.

**Fonts**
- **Preferred:** `NotoSans` (Regular/Italic/Bold), `NotoSansMono` (Regular/Bold) bundled under `src/assets/fonts/`.
- **Fallback:** jsPDF built-ins (`helvetica`/`courier`) if Noto registration isn’t available.

**Service Worker**
- **Fresh edits:** `/songs/**` and `/src/data/index.json` use network-first in `src/sw.js` so changed songs show after deploy.
- **Cache busting:** Build with `VITE_COMMIT_SHA=$(git rev-parse HEAD)` to invalidate old caches per release.

**Tests**
- **Planner:** `src/__tests__/pdf_mvp.plan.test.js` guards columns/font-size/page-count decisions.
- **Chords:** `src/__tests__/pdf_mvp.chords.test.js` guards alignment invariants and trailing chords.
- **Sections:** `src/__tests__/pdf_mvp.sections.test.js` guards section integrity and header spacing.
- **Run:** `npm run test:mvp`

**Extending to Setlists/Songbook**
- Reuse the section builder and per-song render; add per-song page starts, numbering, and optional TOC.

**Do Not Regress**
- Keep the approved constants and spacing unless explicitly updated with tests:
  - Title 26 pt; Key 16 pt gray; lyric/chord 12–16 pt; line-height ≈ 1.2; header gap ≈ 1.125 lines; minimal 1-space chord separation; sections unsplittable.

