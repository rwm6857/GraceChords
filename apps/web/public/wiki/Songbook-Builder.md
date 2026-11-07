Create a PDF songbook from selected songs without transposition. For broader planning, compare with [[Setlists]].

## At a glance
- Song list with search and add/remove buttons
- Sticky header with inline search
- Language chips select preferred translation variant for add/search lists
- “Add all” adds every song matching the current search
- Export is alphabetized and numbered
- Always generates a table of contents; optional cover image
- TOC defaults to one column, switches to two columns to avoid spilling to page 2; if continued, stays two-column
- Default cover page shows “GraceChords Songbook” and today’s date
- Sections never split across pages

## Selection
- **Search** within the page header filters the visible songs using the same word-prefix search as the Songs page.
- Search also matches alternate titles/tags/authors across linked translations (`song_id` groups).
- Results prioritize songs that have the selected language variant.
- **Add all** selects every song matching the current search; use this for quick bulk selection.
- **Clear** removes all current selections so you can start fresh.
- For a planning-focused alternative, see [[Setlists]] for how saved lists differ from ad-hoc songbooks.

## Quick Actions
The Home page's songbook quick action opens the builder with one of these preset selections:
- **Random 10-Song Collection** (`random10SongCollection`): selects 10 random songs.
- **"Send Me" Songbook** (`sendMeSongbook`): selects songs tagged nation(s), mission(s), or community (falls back to 5 random songs if none match).
- **GraceChords Songbook** (`graceChordsSongbook`): selects the entire library.

## Tag-based selection
- Add a `?tags=` query parameter (comma-separated) to the URL to add every song with any of those tags to the selection (e.g., `?tags=advent,call_to_worship`).

## Export
- Optional **Upload cover image** (JPG, PNG, or WEBP, max 2 MB) adds a cover before generating the PDF; otherwise the default cover applies.
- **PDF generation steps**
  1. Review your selected songs and choose a cover (optional).
  2. Click **Export PDF** to alphabetize, number, and generate the PDF with a table of contents.
  3. Save or share the PDF from your browser’s download prompt.
- **Mobile layout notes**: The page switches to **Add songs** / **Current** tabs, and export controls remain in the header so you can manage selection and export on phones.

[[PDF-and-Printing]]
