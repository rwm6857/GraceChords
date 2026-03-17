Step-by-step walkthrough to add new songs or edit existing ones in GraceChords.

## Add a New Song

Option A — Use the Admin Tool (recommended)
1) Open `/admin` and enter the password (`VITE_ADMIN_PW` in your `.env`).
2) Paste or write your ChordPro text.
3) Fill metadata at the top of the file:
   - `{title: ...}` (required), `{key: ...}` (original), optional `{capo: N}`, `{tags: ...}`, `{authors: ...}`, `{country: ...}`
   - Translation fields (when applicable): `{song_id: ...}` and `{lang: ...}` (`en` if `lang` is omitted)
   - Optional media: `{youtube: ...}`, `{mp3: ...}`, `{pptx: <file>.pptx}` if a slide deck exists under `public/pptx/`
4) Use Quick chords to insert `[C]`, `[Am]`, etc. Buttons adapt to the song’s key.
5) Click **Stage** to queue the song for publishing.
6) Choose a filename (underscores, lowercase) if prompted.
7) Enter your name in **Edits Author** and click **Publish** to open a PR, or **Download** to save a ZIP for manual copy.

Option B — Import via CLI (DOCX/PDF/images)
```bash
# Use the ingest CLI (recommended)
cd scripts/ingest
npm i
npm run build

npx gc-ingest ingest /path/to/file.docx
npx gc-ingest ingest /path/to/file.pdf

# Normalize names and rebuild the index
npm run normalize && npm run build-index
```
Edit the generated `.chordpro` file(s) under `public/songs/` to refine sections and chords.

Option C — Manual add
1) Create a new file under `public/songs/` with underscores (e.g., `glorious_king.chordpro`).
2) Add metadata and content in ChordPro format (see [[ChordPro-Guide]]).
3) Run `npm run normalize && npm run build-index`.

## Add or Edit a Translation
1) Create a separate `.chordpro` file for each language variant.
2) Use the same `{song_id: ...}` across all variants in the same translation group.
3) Set `{lang: ...}` on each file (`en`, `tr`, `ar`, `es`). If omitted, GraceChords treats it as English.
4) Keep `{title: ...}` in each language file as its local title. Titles do not need to match across translations.
5) Rebuild index: `npm run build-index`.

Example:
```chordpro
{title: Send Us Lord}
{song_id: send-us-lord}
{lang: en}
```

```chordpro
{title: Rab Bizi Gonder}
{song_id: send-us-lord}
{lang: tr}
```

## Edit an Existing Song

Option A — Use the Admin Tool
1) Open `/admin`.
2) Click **Load existing** and choose a song from the catalog.
3) Make edits in the editor; adjust Original Key to keep quick chords accurate.
4) Click **Stage** (shows an “Editing existing” badge and `update: <file>` message).
5) Enter **Edits Author** and **Publish** (PR) or **Download** (ZIP) for manual copy.

Option B — Edit the file directly
1) Open `public/songs/<file>.chordpro` in your editor.
2) Make changes and save.
3) Run `npm run build-index` to refresh `src/data/index.json`.

## Verify in the App
1) Home — search and open the song; confirm title/key/tags.
2) Song Library — confirm language chips appear, translation names render in selected language, and fallback divider appears for missing translations.
3) SongView — switch language chips, transpose (`[`/`]`), toggle chords (`c`), reading view (1/2‑column), export PDF/JPG.
4) Setlist/Songbook — confirm language chips and search use translated titles where available.
5) Worship Mode — open via the Song or Setlist toolbar for full‑screen performance view.

## Naming & Index Tips
- Use lowercase + underscores (spaces and dashes → `_`).
- Run `npm run normalize` before building the index to fix names and copy any PPTX from `TO_RENAME/`.
- Rebuild index after changes: `npm run build-index`.
- Sorting places numeric titles first; otherwise case‑insensitive by title, ignoring leading punctuation.
- For translation sorting, songs with a variant in the selected language appear first (A→Z), then songs without one (A→Z).

## Translation metadata inheritance
- English is the master/source of truth when available in a translation group.
- Translation files inherit `key`, `tags`, `authors`, `country`, `youtube`, `mp3`, and `pptx` unless a non-empty override is set in the translation file.
- Blank values in translation files still inherit from English.

## Optional: Slides (PPTX)
- Place a deck at `public/pptx/<song_slug>.pptx` (same base name as the `.chordpro`).
- A “Download PPTX” button appears on the Song page when present.
See [[Slides-(PPTX)]] for details.

## Optional: Resources (Blog)
- Create guides under `public/resources/*.md` with frontmatter (title, author, date, tags, summary).
- Rebuild index with `npm run build-resources-index` or rely on CI.
See [[Resources]] and [[Admin-Resources]].

## Troubleshooting
- Song not found: confirm the `.chordpro` file exists and re-run `npm run build-index`.
- Chords misaligned: ensure chord brackets precede the exact lyric characters and keep lines concise.
- Fonts in PDF look off: ensure Noto fonts exist under `src/assets/fonts/`.
- Stale build: set `VITE_COMMIT_SHA=$(git rev-parse HEAD)` during `npm run build` to refresh caches.

## Add Visual Walkthroughs
- Place screenshots or GIFs under `public/wiki-assets/` (files committed to the repo).
- Reference them in Markdown using `![](../wiki-assets/your-image.png)`.
- Inline captions can be added with normal Markdown (e.g., `_Figure: staging a new song_`).

See also: [[ChordPro-Guide]] [[Importing-Lyrics]] [[File-Naming-and-Normalization]] [[Index-Building]] [[Admin-Tool]]
