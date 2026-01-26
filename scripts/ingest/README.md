# GraceChords Ingest CLI

This folder contains a standalone Node + TypeScript CLI for ingesting song sources into GraceChords.

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

npx gc-ingest batch ../../incoming --concurrency 2

npx gc-ingest compare
npx gc-ingest compare --do-ingest
npx gc-ingest compare --pdf-dir ../../some-pdfs --songs-dir ../../public/songs
npx gc-ingest compare --strict-chords
npx gc-ingest compare --chords
npx gc-ingest compare --lyrics
npx gc-ingest compare --sections
npx gc-ingest compare --export-json
npx gc-ingest compare --export-md

npx gc-ingest normalize ../../scripts/ingest/_ingest_staging/amazing_grace

npx gc-ingest approve ../../scripts/ingest/_ingest_staging/amazing_grace --to ../../public/songs --run-index

npx gc-ingest report ../../scripts/ingest/_ingest_staging/amazing_grace
```

## Staging Output

Each ingest writes to `scripts/ingest/_ingest_staging/<slug>/`:

- `source/` original input (+ preview image when possible)
- `drafts/<slug>_draft.chordpro`
- `normalized/<slug>.chordpro`
- `report.json`
- `report.html`
- `preview.html`

## Default inbox

If you run `gc-ingest` with no arguments, it will batch ingest everything in:\n\n- `scripts/ingest/_ingest_inbox/`\n\nThis folder is git-ignored; drop PDFs/DOCX/images there for quick processing.

## Cleanup

```bash
npx gc-ingest --cleanup
```

Prompts before clearing `scripts/ingest/_ingest_inbox/` and `scripts/ingest/_ingest_staging/`.

## Compare

`gc-ingest compare` will compare staged `normalized` outputs against the current song library.\n\nDefaults:\n- PDFs: `scripts/ingest/_ingest_inbox/`\n- Songs: `public/songs/`\n\nUse `--do-ingest` to re-ingest before comparing. An HTML report is written to:\n\n- `scripts/ingest/_ingest_staging/compare_report.html`
