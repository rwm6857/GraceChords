Step-by-step walkthrough to add new songs or edit existing ones in GraceChords.

Songs are stored in the Supabase `songs` table. The Editor Portal (`/editor`) is the primary interface for adding and editing songs.

## Add a New Song

1. Open `/editor` (requires editor role).
2. Click **New Song** to open a blank ChordPro editor.
3. Fill in the metadata directives at the top:
   - `{title: ...}` (required), `{key: ...}` (original key)
   - Optional: `{capo: N}`, `{tags: ...}`, `{authors: ...}`, `{country: ...}`
   - Translation fields: `{song_id: ...}` (shared across language variants) and `{lang: ...}` (`en` if omitted)
   - Optional media: `{youtube: <video_id>}`, `{mp3: <url>}`
4. Use the Quick Chords panel to insert `[C]`, `[Am]`, etc. Buttons adapt to the song's key.
5. Click **Save** (or **Publish**) to write the song to Supabase.

## Edit an Existing Song

1. Open `/editor`.
2. Search for and select the song from the catalog list.
3. Make edits in the ChordPro editor.
4. Click **Save** to update the `songs` table in Supabase.

## Add or Edit a Translation

1. Create a new song entry (as above) for the translated language.
2. Set `{song_id: <shared-id>}` to the same value as the English variant — this links them.
3. Set `{lang: <code>}` (`en`, `tr`, `ar`, `es`). Defaults to `en` if omitted.
4. The title can be different in each language file.

Example:
```chordpro
{title: Send Us Lord}
{song_id: send-us-lord}
{lang: en}
```

```chordpro
{title: Rab Bizi Gonder}
{song_id: send-us-lord}
{lang: tr}
```

## Translation metadata inheritance
- English is the master variant when available.
- Translations inherit `key`, `tags`, `authors`, `country`, `youtube`, `mp3` unless the translation sets a non-empty override.

## Verify in the App
1. **Songs page** — search and open the song; confirm title/key/tags.
2. **Language chips** — confirm translation chips appear, names render in selected language.
3. **SongView** — switch language chips, transpose (`[`/`]`), toggle chords (`c`), reading view.
4. **Setlist/Songbook** — confirm language chips and search use translated titles where available.
5. **Worship Mode** — open via the Song or Setlist toolbar.

## Optional: Slides (PPTX)
PPTX slide decks are uploaded to Cloudflare R2 via the PPTX upload widget in the song editor.
See [[Slides-(PPTX)]] for details.

## Troubleshooting
- Song not found in search: check that the row exists in Supabase and `is_deleted = false`.
- Chords misaligned: ensure chord brackets precede the exact lyric characters and lines are not excessively long.
- Fonts in PDF look off: ensure Noto font files exist under `src/assets/fonts/`.

See also: [[ChordPro-Guide]] [[Slides-(PPTX)]] [[Admin-Tool]]
