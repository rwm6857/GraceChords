React Songbook Pro (Vector PDF, Fuse Search, Transposer)
=========================================================

Features
- Song directory (fuzzy search by title/lyrics/tags via Fuse.js)
- Song view with chords above lyrics and key transposer
- Vector PDF export (single-song) with selectable text, bold chords, minimum 14pt
- Adjustable lyric font size and column count (auto/1/2)
- YouTube/MP3 media support
- Data in `src/data/songs.json`

Quick start
1. npm install
2. npm run dev
3. Edit songs in src/data/songs.json
4. Download a PDF from a song page (respects transpose + font size)

Deploy to GitHub Pages
- npm run deploy

Notes
- Multi-song vector PDF is planned; for now, single-song export is implemented using jsPDF text APIs.
- If you want exact font control, ensure the fonts exist on client systems or embed custom fonts with jsPDF (advanced).


Embedding fonts
---------------
1) Download free TTFs (e.g., Google Noto Sans Regular/Bold and Noto Sans Mono Bold).
2) Put them in `public/fonts/` with these names:
   - NotoSans-Regular.ttf
   - NotoSans-Bold.ttf
   - NotoSansMono-Bold.ttf
3) PDFs will embed these at runtime. If absent, jsPDF will fall back to Helvetica/Courier.

Per-song transpose in multi-PDF
-------------------------------
- In the directory, each row has a key dropdown. Pick a key per song, check the box, then click **Download Selected PDF**.
- The PDF will render each song in its chosen key (vector text).
