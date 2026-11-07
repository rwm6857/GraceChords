Build and export a worship set that remembers your choices.

## At a glance
- Add songs (and Bible verses) and drag to reorder
- Set per-song target keys
- **Cloud saves** (Supabase, autosaved) for signed-in users; a single on-device draft (`localStorage`) for guests
- Language chips select preferred translation variant for add/search lists
- Export PDF or PPT (PPTX)
- Share a link to the current set

1. Search the **Song Library** panel and add songs to the set.
2. Drag rows to reorder and adjust target keys.
3. Signed in: pick or create sets in the **Saved Sets** panel; changes save automatically. Signed out: your set is kept on this device until you sign in.
4. Use **PDF** to merge charts, or **PPT** for slides — **Separate** downloads a ZIP of each song's deck (files are named with index order); **Combined** (beta) merges them into one deck.
5. Use **Share** to copy a link that restores the exact set and target keys.

## Saved Sets

When signed in, sets are saved to Supabase (the `setlists` and `setlist_songs` tables) and sync across devices and the GraceChords app. The web workspace uses the shared core setlists repo (`packages/core/src/setlists/setlistsRepo.js`) via `src/hooks/usePersonalSetlists.js` (list, create, duplicate, delete) and `src/hooks/useSetlistBuilder.js` (debounced autosave).

When not signed in, the working set is a single draft in `localStorage`. Sets saved by the old builder in `localStorage` can be imported once after signing in.

Set limits: users can save 30 personal setlists; editors and admins 50; the owner is uncapped. See [[Roles-and-Access]].

## Translation behavior
- Setlist add/search uses the same translation grouping model as Song Library.
- Search matches alternate titles/tags/authors from all variants in each translation group.
- Results prioritize songs available in the selected language.
- Selected song language is persisted to `localStorage` (`pref:songLanguage`) and shared with Songs/SongView/Songbook.

## Toolbar
- Title line shows the current set name (new sets default to a dated name such as "9/14 Worship").
- Actions: Share, PDF, PPT, Send to Telegram, Worship Mode; the overflow menu has Rename, Transpose up/down, Reset keys, and (for saved sets) Service date, Duplicate set, and Delete set.
- Worship Mode works with or without a selection (blank launch allowed).

[[SongView]] [[Slides-(PPTX)]] [[PDF-and-Printing]] [[Roles-and-Access]]
