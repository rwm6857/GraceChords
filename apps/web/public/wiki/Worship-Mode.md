## Worship / Perform Mode

Worship Mode is a full‑screen, touch‑friendly view for live performance. It renders a single song per screen with a clean layout, quick transpose, and simple navigation.

### Opening Worship Mode
- From a Song: click **Worship Mode**.
- From a Setlist: click **Worship Mode** to load the current set.
- Direct URL: `/worship/<id1,id2,...>` (comma‑separated song slugs). Example: `/worship/abba,above-all`.
 - Blank: `/worship` opens Worship Mode without a selection; add songs with the toolbar's **Add song by title** search to build a flow.

### Layout & Fitting
- One or two columns; entire song rendered on one screen (no pagination).
- Auto‑fit font picks the largest size that fits the window, trying 18 → 14 px with two columns preferred on desktop and one column preferred on mobile. The column count can also be set in Settings.
- Comments are italicized; chords display above lyrics with precise alignment.

### Controls (Toolbar)
- Previous / Next: move through the songs in the current list.
- Lower key / Raise key: shift the key by a whole step (or a half step when **Half-step** is enabled in Settings).
- Reset key: revert to the song’s starting key.
- Font Size A−/A+: manual override to shrink/grow text.
- Toggle chords: show/hide chords above lyrics.
- Settings (gear): theme (light/dark), chords, clock and timer, 1/2 columns, half-step transpose, set key, reset key.

### Navigation
- Mobile/tablet: swipe left = NEXT, swipe right = PREV; swipe up/down to raise/lower the key.
- Desktop: Arrow Right/Left keys.

### Persistence
- Theme uses the existing site preference: `gracechords.theme`.
- The current session (song position, per-song keys, columns, font size, chords, half-step) is kept in `sessionStorage` under `worship:session`, so a reload resumes where you were.
- Clock and timer preferences are stored in `localStorage` (`worship:showClock`, `worship:showStopwatch`, `worship:clock24h`).

### Notes & Tips
- The site navbar is hidden in Worship Mode to maximize space.
- Keep your setlist prepared ahead of time: **Worship Mode** from Setlist loads the entire flow.
- For smaller screens, use A−/A+ to fine‑tune in the room if auto‑fit feels too tight/loose.

### Troubleshooting
- “Text looks too small”: tap A+ to increase size; auto‑fit chooses the largest size that fits the full song.
- “Chords wrap oddly”: ensure your song’s chord positions are correct in ChordPro; collisions are resolved and chords align over matching lyric characters.
- “Song not found”: confirm the song exists in the Supabase `songs` table with `is_deleted = false` and `status = 'published'`.
