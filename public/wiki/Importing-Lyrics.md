Import lyrics from PDF/DOCX/images into a ChordPro skeleton that you can edit and add chords to later.

## Recommended: gc-ingest CLI
The modern ingestion workflow lives under `scripts/ingest/` and supports OCR, staging, normalization, and compare reports.

```bash
cd scripts/ingest
npm i
npm run build

# drop files into scripts/ingest/_ingest_inbox/
npx gc-ingest

# single file
npx gc-ingest ingest /path/to/song.pdf
```

Staged output lands in `scripts/ingest/_ingest_staging/<slug>/` with `drafts/`, `normalized/`, and HTML previews.

See [[Ingestion-CLI]] for full usage details.

## Legacy CLI usage (npm run ingest)
```bash
# DOCX → ChordPro (default output to public/songs/)
npm run ingest -- path/to/file.docx

# PDF → ChordPro
npm run ingest -- path/to/file.pdf

# Multiple files (custom directory)
npm run ingest -- file1.docx file2.pdf --out path/to/dir

# Emit plain headers instead of directives
npm run ingest -- song.pdf --plain
```

## Optional dependencies
- DOCX: `npm i -D mammoth`
- PDF:  `npm i -D pdf-parse`

Images (OCR) are not enabled by default in the legacy CLI. Use gc-ingest for OCR support.

## Output
- Title is guessed from the first non‑header line.
- The tool emits a ChordPro skeleton with meta lines (`{title: …}`, `{key: }`, etc.).
- Section headers are wrapped with short ChordPro directives (default):
  - Verse → `{sov: Verse N}` … `{eov}`
  - Chorus (incl. Pre‑Chorus label) → `{soc: Chorus|Pre-Chorus}` … `{eoc}`
  - Other labels (Intro, Tag, Instrumental, etc.) → `{sob: <Label>}` … `{eob}`
  - Use `--plain` to output readable headers instead (e.g., `Verse 1`, `Pre‑Chorus`).
- Normalize and update the index after importing:
```bash
npm run normalize && npm run build-index
```

## Defaults & flags
- Default output directory: `public/songs/` (must already exist). Use `--out <dir>` to override.
- Default section mode: ChordPro directives. Use `--plain` to emit readable headers instead.
- On filename conflicts the tool will prompt you to Overwrite, Rename, Skip, or Abort.
- The tool removes leading duplicate title lines and recognizes lines like `(Key of Am)` to populate `{key: Am}` while removing that line from the lyrics. Chord-only lines are ignored.
- Output filenames use underscores (e.g., `above_all.chordpro`).
