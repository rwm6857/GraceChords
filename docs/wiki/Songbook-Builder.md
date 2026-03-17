Create a PDF songbook from selected songs without transposition. For broader planning, compare with [[Setlists]].

## At a glance
- Checkbox list with search and filters like Home
- Sticky header with inline search
- Language chips select preferred translation variant for add/search lists
- “Add all” respects current filters (primary, right-aligned)
- Export is alphabetized and numbered
- Always generates a table of contents; optional cover image
- TOC defaults to one column, switches to two columns to avoid spilling to page 2; if continued, stays two-column
- Default cover page shows “GraceChords Songbook” and today’s date
- Sections never split across pages

## Selection
- **Search** within the page header filters the visible songs using the same query behavior as the Home page.
- Search also matches alternate titles/tags/authors across linked translations (`song_id` groups).
- Results prioritize songs that have the selected language variant.
- **Add all** selects every song matching the current filters (including tag filters); use this for quick bulk selection.
- **Clear** removes all current selections so you can start fresh.
- For a planning-focused alternative, see [[Setlists]] for how saved lists differ from ad-hoc songbooks.

## Quick Actions
- **random10SongCollection**: Instantly selects 10 random songs from the filtered results to spark variety.
- **sendMeSongbook**: Packages the current selection and triggers the export flow for a ready-to-share PDF.
- **graceChordsSongbook**: Applies the curated GraceChords collection as the active selection.

## Tag-based selection
- Add a `?tags=` query parameter (comma-separated) to the URL to prefilter songs and have **Add all** honor those tags (e.g., `?tags=advent,call_to_worship`).
- Pair this with **Add all** or quick actions to build a themed book without manual clicking.

## Export
- Optional **Cover Image** lets you upload or choose a cover before generating the PDF; otherwise the default cover applies.
- **PDF generation steps**
  1. Review your selected songs and choose a cover (optional).
  2. Click **Export** to alphabetize, number, and generate the PDF with a table of contents.
  3. Save or share the PDF from your browser’s download prompt.
- **Mobile layout notes**: The sticky header, search bar, and export controls remain accessible; the song list scrolls beneath so you can manage selection and export on phones.

[[PDF-and-Printing]]
