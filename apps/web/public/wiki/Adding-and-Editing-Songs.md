Step-by-step walkthrough to add new songs or edit existing ones in GraceChords.

Songs are stored in the Supabase `songs` table. The song editor (`/portal/editor`) is the primary interface for adding and editing songs. Any signed-in user can open it: **editors** and above save directly, while **users** submit their changes for review. (`/editor` is the Editor Portal landing page for editors.)

## Add a New Song

1. Open `/portal/editor` (sign-in required). When you are already editing a song, click **New Song** for a blank form.
2. Fill in the **Metadata** panel:
   - **Title**, **Key**, and at least one **Tag** are required.
   - Optional: **Artist**, **Country**, **Language**, **Time Signature**, **Tempo (BPM)**, **YouTube ID or URL**.
3. Write the lyrics and chords in the **ChordPro Editor** panel. Metadata lives in the form fields, not in `{title:}`/`{key:}` directives in the body.
   - Alternatively, click **Import ChordPro** to load a `.chordpro`/`.pro`/`.cho` file; its `{title}`, `{artist}`, `{key}`, `{tempo}`, `{time}`, `{tags}`, `{country}`, `{lang}` and `{youtube}` directives fill the form.
4. Use the Quick Chords bar to insert `[C]`, `[Am]`, etc. Buttons adapt to the song's key.
5. Click **Save** (editors and above) to write the song to Supabase, or **Submit for Review** (users) to send it to the review queue.

## Edit an Existing Song

1. Open a song page and click the pencil (**Edit this song**) button, or open `/portal/editor` and use the search box to find the song.
2. Make edits in the metadata form and ChordPro editor.
3. Click **Save** to update the `songs` table in Supabase (or **Submit for Review** if you are not an editor).

## Translations
The editor has a **Language** field, but translation grouping is not yet wired to the Supabase catalog: every song currently appears as its own entry, and language chips do not show in the app.

## Verify in the App
1. **Songs page** — search and open the song; confirm title/key/tags.
2. **SongView** — transpose (key selector or `[`/`]`), toggle chords, two-column reading view.
3. **Setlist/Songbook** — confirm the song can be found and added.
4. **Worship Mode** — open via the Song or Setlist toolbar.

## Optional: Slides (PPTX)
PPTX slide decks are uploaded to Cloudflare R2 via the PPTX upload widget in the song editor.
See [[Slides-(PPTX)]] for details.

## Troubleshooting
- Song not found in search: check that the row exists in Supabase with `is_deleted = false` and `status = 'published'` (drafts are hidden from users below editor).
- Chords misaligned: ensure chord brackets precede the exact lyric characters and lines are not excessively long.
- Fonts in PDF look off: ensure Noto font files exist under `apps/web/src/assets/fonts/`.

See also: [[ChordPro-Guide]] [[Slides-(PPTX)]] [[Admin-Portal]]
