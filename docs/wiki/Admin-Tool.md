Draft, load, and update songs directly in the browser.

## At a glance
- Compose ChordPro text with live preview
- Load an existing song from the index to update it
- Stage songs and open a PR to add/update `public/songs/*.chordpro`
- Quick chord insert buttons (transpose-aware by key)
- Password protected via `VITE_ADMIN_PW`

1. Navigate to `/admin` and enter the password.
2. Write or paste ChordPro content and preview changes.
3. Use "Load existing" to fetch a song from the catalog. When loaded, an "Editing existing" badge appears and the filename field shows the target.
4. Use the Quick chords strip to insert chords like `[C]`, `[Am]` at the cursor. Buttons adapt to the song key (I, ii, iii, IV, V, vi).
5. Set the Original Key by typing a symbol (e.g., C, Am, Dm, F#m). Non-standard entries are allowed; quick chord buttons default to G if the key is unrecognized.
6. Click **Stage Song** to queue changes. If editing, the staged entry will carry an `update: <file>` commit message.
7. Click **Create PR…** to push staged files to a feature branch and open a pull request.

Notes
- Staged filenames can be renamed inline before creating the PR.
- When editing an existing file, the default commit message is `update: <filename>`.
- Drafts can be saved in the browser and exported as a ZIP.

[[ChordPro-Guide]]
