Build and export a worship set that remembers your choices.

## At a glance
- Add songs and drag to reorder
- Set per-song target keys
- Saved to `localStorage` (named saves)
- Language chips select preferred translation variant for add/search lists
- Export PDF or PPTX
- Share a link to the current set
- Print a quick outline

1. Search for songs and add them to the set (sticky header; results scroll independently).
2. Drag rows to reorder and adjust target keys.
3. Save sets by name. Use **Load** to open the modal and select a saved set.
4. Use **Export PDF** to merge charts or **Export PPTX** for slides (files are named with index order).
5. Use **Share Set** to copy a link that restores the exact set and target keys.
6. Print the set for a simple checklist (print-only outline is included).

Translation behavior
- Setlist add/search uses the same translation grouping model as Song Library.
- Search matches alternate titles/tags/authors from all variants in each translation group.
- Results prioritize songs available in the selected language.
- Selected song language is persisted to `localStorage` (`pref:songLanguage`) and shared with Songs/SongView/Songbook.

Toolbar
- Title line shows the current set name (defaults to “New Setlist”).
- Left cluster: Save, Load (modal), New, Delete.
- Right cluster: Export PDF, Export PPTX, Share Set, Worship Mode.
- Worship Mode works with or without a selection (blank launch allowed).

[[SongView]] [[Slides-(PPTX)]] [[PDF-and-Printing]]
