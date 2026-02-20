# Song Library

Visit the in-app [Song Library](/songs) to browse, search, and filter all available charts.

## Quick start
- Open the Song Library and start typing to search by **title**, **tag**, or **author**.
- Use language chips (`EN`, `TR`, `AR`, `SP`, etc.) to choose translation display language.
- Click a result (or highlight it with the arrow keys) and press **Enter** to open the song.
- Keyboard navigation works across the list: use the **Up/Down arrows** to move the active row and **Enter** to open it.

## Filters
- Selecting multiple tags uses **ANY** matching—songs appear if they include **any** of the tags you pick.
- The **ICP only** toggle sticks between visits; its state is saved in your browser's `localStorage` so it persists across reloads on the same device.
- Song language preference is also saved in `localStorage` (`pref:songLanguage`) and reused in SongView, Setlist, Songbook, Worship Mode, and Home suggestions.

## Translation behavior
- Language chips appear only when at least one translation exists in that language.
- Songs are grouped by translation `song_id`.
- If a translation exists in the selected language, the card title uses that translated title.
- Clicking a card opens that selected-language variant directly.
- Search checks all known variants in the group (alternate titles/tags/authors), then shows the best display variant for the selected language.
- Result ordering is:
  - songs with selected-language translation (A→Z)
  - songs without selected-language translation (A→Z)
- A divider labeled **No Translation in Selected Language** appears above fallback songs.

## Deep Search
> **Deep Search:** Turn on the lyrics search toggle when you need to scan full lyrics, not just titles, tags, or authors. This issues an extra network request, so expect more data use and a brief delay, but it also expands your results to include songs where the lyrics contain your query.
