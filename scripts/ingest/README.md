# GraceChords Ingest CLI

This folder contains a standalone Node + TypeScript CLI for ingesting song sources into GraceChords.

Supported inputs:
- PDF, DOCX, images (PNG/JPG/WEBP)
- OpenSong XML files (`.txt`, `.xml`, or extensionless XML)

## Setup

```bash
cd scripts/ingest
npm i
npm run build
```

Optional system dependencies:

- Python 3 + pdfplumber (or pymupdf) for PDF extraction
  - `python3 -m pip install pdfplumber`
- Tesseract OCR for image/scanned PDFs
  - macOS: `brew install tesseract`
- For scanned PDFs OCR fallback, install PyMuPDF for page rendering
  - `python3 -m pip install pymupdf`

## Commands

```bash
npx gc-ingest ingest ../../somefile.docx --title "Amazing Grace" --authors "John Newton"
npx gc-ingest ingest-songbook ../../Revival_Songbook_SE.pdf

npx gc-ingest batch ../../incoming --concurrency 2
npx gc-ingest batch ../../opensong-txts --concurrency 4

npx gc-ingest compare
npx gc-ingest compare --do-ingest
npx gc-ingest compare --pdf-dir ../../some-pdfs --songs-dir ../../public/songs
npx gc-ingest compare --strict-chords
npx gc-ingest compare --chords
npx gc-ingest compare --lyrics
npx gc-ingest compare --sections
npx gc-ingest compare --export-json
npx gc-ingest compare --export-md

npx gc-ingest stats

npx gc-ingest normalize ../../scripts/ingest/_ingest_staging/amazing_grace

npx gc-ingest approve ../../scripts/ingest/_ingest_staging/amazing_grace --to ../../public/songs --run-index

npx gc-ingest report ../../scripts/ingest/_ingest_staging/amazing_grace

npx gc-ingest export
```

## Songbook PDF ingest

Use `ingest-songbook` for multi-page songbooks that contain many numbered songs (including mixed Turkish/English sections):

```bash
npx gc-ingest ingest-songbook /absolute/path/to/songbook.pdf
```

What it does:
- keeps PDF page order (no cross-page line mixing)
- detects numbered song markers like `12. TITLE`
- skips non-song pages (cover/contents pages with no chord/lyric signal)
- splits bilingual sections into separate staged songs when possible (same number, Turkish/English titles)
- maps Turkish section markers like `[KITA]`, `[NAKARAT]`, `[KÖPRÜ]` into the same ChordPro section directives as English markers
- normalizes extracted song titles to Title Case while keeping the song number prefix in `{title: ...}`

## Staging Output

Each ingest writes to `scripts/ingest/_ingest_staging/<slug>/`:

- `source/` original input (+ preview image when possible)
- `drafts/<slug>_draft.chordpro`
- `normalized/<slug>.chordpro`
- `report.json`
- `report.html`
- `preview.html`

## Default inbox

If you run `gc-ingest` with no arguments, it will batch ingest everything in:\n\n- `scripts/ingest/_ingest_inbox/`\n\nThis folder is git-ignored; drop PDFs/DOCX/images there for quick processing. OpenSong files with no detected chords are skipped (no staging output).

## Cleanup

```bash
npx gc-ingest --cleanup
```

Prompts before clearing `scripts/ingest/_ingest_inbox/` and `scripts/ingest/_ingest_staging/`.

## Export normalized files

```bash
npx gc-ingest export
```

Copies all staged `normalized/*.chordpro` files into:

- `scripts/ingest/_ingest_exports/`

Use `--clean` to clear the export folder before copying:

```bash
npx gc-ingest export --clean
```

## Compare

`gc-ingest compare` will compare staged `normalized` outputs against the current song library.\n\nDefaults:\n- PDFs: `scripts/ingest/_ingest_inbox/`\n- Songs: `public/songs/`\n\nUse `--do-ingest` to re-ingest before comparing. An HTML report is written to:\n\n- `scripts/ingest/_ingest_staging/compare_report.html`
