## Worship / Perform Mode

Worship Mode is a full‑screen, touch‑friendly view for live performance. It renders a single song per screen with a clean layout, quick transpose, and simple navigation.

### Opening Worship Mode
- From a Song: click “Open in Worship Mode”.
- From a Setlist: click “Open in Worship Mode” to load the current set.
- Direct URL: `/#/worship/<id1,id2,...>` (comma‑separated song IDs). Example: `/#/worship/abba,above-all`.

### Layout & Fitting
- Single column; entire song rendered on one screen (no pagination).
- Auto‑fit font picks the largest size that fits the device window using the same decision ladder as the PDF engine: tries 16 → 12 px.
- Comments are italicized; chords display above lyrics with precise alignment.

### Controls (Toolbar)
- NEXT →: advance to next song in the current list.
- Key Up (♯): raise key by one semitone.
- Reset Key: revert to the song’s original key.
- Theme: toggle light/dark mode.
- Font Size A−/A+: manual override to shrink/grow text. Reload page to return to auto‑fit.
- Chords On/Off: toggle chord display above lyrics.

### Navigation
- Mobile/tablet: swipe left = NEXT, swipe right = PREV.
- Desktop: Arrow Right/Left keys.

### Persistence
- Theme uses the existing site preference: `gracechords.theme`.
- Worship settings are stored under:
  - `worship:transpose` — current transpose (semitones).
  - `worship:showChords` — `1`/`0`.
  - `worship:fontSize` — manual font size when not auto‑fitting.

### Notes & Tips
- The site navbar is hidden in Worship Mode to maximize space.
- Keep your setlist prepared ahead of time: “Open in Worship Mode” from Setlist loads the entire flow.
- For smaller screens, use A−/A+ to fine‑tune in the room if auto‑fit feels too tight/loose.

### Troubleshooting
- “Text looks too small”: tap A+ to increase size; auto‑fit chooses the largest size that fits the full song.
- “Chords wrap oddly”: ensure your song’s chord positions are correct in ChordPro; collisions are resolved and chords align over matching lyric characters.
- “Song not found”: confirm the song ID exists in `src/data/index.json` and that `public/songs/<file>.chordpro` is present. Rebuild the index if needed.

