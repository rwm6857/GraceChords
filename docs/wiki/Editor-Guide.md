# Editor Guide

Use the in-browser Editor to stage song and resource changes before opening a pull request.

## Access and tabs
- Gate: the Editor requires an author name plus the `VITE_EDITOR_PW` (falls back to `VITE_ADMIN_PW`); unauthenticated users only see the login form.
- Tabs: the page opens on the **Song Editor** by default. URL params can preselect content—`?tab=posts` or `?tab=resources` switches to the **Post Editor** tab, while `?song=:id`, `?resource=:slug`, `?newSong=1`, or `?newResource=1` also flip to the relevant tab and prefill the form.

## Staging behavior
- Staged items persist in `sessionStorage` (`editor:staged`) so reloading the page does not lose pending changes.
- The staged table lists each change (kind, action, filename, summary) with controls to remove individual rows or clear everything.

## Token workflow and PR modal
- On load, the Editor checks for `ghToken` in `localStorage`; if absent, it opens the token modal. Saved tokens are validated via the GitHub API (`Validate` flow) and marked with a check beside the author name.
- **Open PR** validates prerequisites (staged changes present and author provided) before showing the PR modal. The modal uses repository defaults from GitHub, then `createEditorPr` branches from `main`, writes staged files to `public/songs/` or `public/resources/`, and opens the created PR in a new tab.

## Helper utilities
- **Canonicalization**: `buildCanonical` runs `convertToCanonicalChordPro` and `serializeChordPro` to normalize titles, keys, filenames, and directive formatting.
- **Disclaimers**: `appendDisclaimerIfMissing` ensures the copyright notice is included in staged chord charts.
- **Instrumentals**: `formatInstrumental` renders structured instrumental specs into preview lines inside the Post Editor helper components.
