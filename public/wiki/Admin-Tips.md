Practical tips for using the in‑app Admin editor (/#/admin) to author and update songs.

## Workflow
- Load existing or start a new song. Use Quick chords and Directives to speed up editing.
- Click Lint to catch common ChordPro issues.
- Stage Song to add it to the staging table. Convert → Stage first if starting from plain text.
- Create PR to open a branch and commit staged files.

## Controls
- Save with ChordPro directives: When on, sections are written with `{start_of_*}`/`{end_of_*}`. When off, headers are simple text.
- Saves as .chordpro: Files are always saved with a `.chordpro` extension.
- Prefer 2 columns: Adds a `{columns: 2}` hint for PDF layout.
- Capo in header: Writes `{capo: N}` to display the capo in PDFs.

## Metadata
- Title, Key, Authors, Country, Tags, YouTube, MP3 map to `{title: …}`, `{key: …}`, and `{meta: …}` entries. Spaces are preserved.
- Filenames derive from the title id (kebab‑case), but are editable in the staging table.

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
