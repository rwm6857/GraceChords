Draft, load, and update songs directly in the browser.

## At a glance
- Compose ChordPro text with live preview
- Load an existing song from the index to update it
- Stage converts-and-queues songs; Publish opens a PR with staged files
- Download Staged saves a ZIP for manual copy
- Quick chord insert buttons (transpose‑aware by key)
- Supports translation directives (`song_id`, `lang`)
- Password protected via `VITE_ADMIN_PW`

1. Navigate to `/admin` and enter the password.
2. Write or paste ChordPro content and preview changes.
3. Use "Load existing" to fetch a song from the catalog. When loaded, an "Editing existing" badge appears and the filename field shows the target.
4. Use the Quick chords strip to insert chords like `[C]`, `[Am]` at the cursor. Buttons adapt to the song key (I, ii, iii, IV, V, vi).
5. Set the Original Key by typing a symbol (e.g., C, Am, Dm, F#m). Non-standard entries are allowed; quick chord buttons default to G if the key is unrecognized.
6. For translations, add `{song_id: ...}` (shared group id) and `{lang: ...}` (language code). If `lang` is missing, index build treats the file as English.
7. Click **Stage** to convert (when needed) and queue changes. If editing, the staged entry will carry an `update: <file>` commit message.
8. Enter your name in **Edits Author** and click **Publish** to create a pull request.
9. Alternatively, click **Download** to save a ZIP of staged songs for manual copy.

Notes
- Staged filenames can be renamed inline before publishing.
- When editing an existing file, the default commit message is `update: <filename>`.

[[ChordPro-Guide]]
