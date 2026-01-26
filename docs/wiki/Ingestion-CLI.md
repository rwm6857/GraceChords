Standalone ingestion CLI for GraceChords. Handles DOCX/PDF/images, OCR, staging, normalization, and comparison against the song library.

## Setup
```bash
cd scripts/ingest
npm i
npm run build
```

Optional dependencies:
- Python 3 + `pdfplumber` or `pymupdf` for PDF text extraction
  - `python3 -m pip install pdfplumber`
- PyMuPDF for scanned PDF rendering (OCR fallback)
  - `python3 -m pip install pymupdf`
- Tesseract for OCR
  - macOS: `brew install tesseract`

## Inbox + staging
- Inbox: `scripts/ingest/_ingest_inbox/`
- Staging: `scripts/ingest/_ingest_staging/<slug>/`
  - `source/` original input
  - `drafts/<slug>_draft.chordpro`
  - `normalized/<slug>.chordpro`
  - `report.json`, `report.html`, `preview.html`

## Commands
```bash
# ingest everything in the inbox
npx gc-ingest

# ingest a single file
npx gc-ingest ingest /path/to/song.pdf

# batch ingest a folder
npx gc-ingest batch /path/to/folder --concurrency 2

# normalize a staging folder
npx gc-ingest normalize scripts/ingest/_ingest_staging/<slug>

# approve normalized output into public/songs
npx gc-ingest approve scripts/ingest/_ingest_staging/<slug> --to public/songs --run-index

# compare staged output to the library
npx gc-ingest compare
npx gc-ingest compare --do-ingest
npx gc-ingest compare --strict-chords
npx gc-ingest compare --chords --lyrics --sections
npx gc-ingest compare --export-json --export-md

# cleanup inbox + staging (keeps folders)
npx gc-ingest --cleanup
```

## Compare reports
- HTML report: `scripts/ingest/_ingest_staging/compare_report.html`
- JSON/MD exports when enabled:
  - `compare_report.json`
  - `compare_summary.md`

## Notes
- Use `gc-ingest compare` to iterate on alignment and normalization heuristics.
- Chord matching is loose by default; use `--strict-chords` to require exact matches.

See also: [[Importing-Lyrics]] [[Adding-and-Editing-Songs]] [[Development-Commands]]
