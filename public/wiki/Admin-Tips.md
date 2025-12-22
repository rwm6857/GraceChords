Practical tips for using the in‑app Admin editor (/admin) to author and update songs.

## Workflow
- Load existing or start a new song. Use Quick chords and Directives to speed up editing.
- Click Check to catch common ChordPro issues.
- Stage to convert (when needed) and queue the song.
- Publish to open a PR with staged files, or Download to export a ZIP for manual copy.

## Controls
- Saves as .chordpro: Files are always saved with a `.chordpro` extension.
- Edits Author: Required before Publish; appended to the PR body.
- Quick chords: Click buttons or use hotkeys to insert `[Chord]` at the caret:
  - Win/Linux: Alt+1..6
  - macOS: Ctrl+1..6

## Metadata
- Title, Key, Authors, Country, Tags, YouTube, MP3 map to `{title: …}`, `{key: …}`, and `{meta: …}` entries. Spaces are preserved.
- Filenames derive from the title id (underscore slug), but are editable in the staging table.

## Slides (PPTX)
- PPTX files link automatically by slug: `public/pptx/<song-filename-without-ext>.pptx`.
- No PPTX field is needed in the editor.

## Preview
- Live preview parses ChordPro (including `{start_of_*}`/`{end_of_*}`) and shows section labels with chords aligned.

## After editing
```bash
npm run normalize   # fix names; prefer underscores
npm run build-index # update src/data/index.json
npm run test:mvp    # PDF layout guards
npm run build       # output to docs/
```

## See also
- [[Importing-Lyrics]] — convert DOCX/PDF/TXT to a ChordPro skeleton (directives by default).
