# GraceChords

React + Vite app for an interactive ChordPro songbook.

## Run locally
```bash
npm install
npm run dev
```

## Build & deploy (GitHub Pages via `docs/` on main)
```bash
npm run build
# commit & push -> serve from /docs
```
Router uses hash (`/#/…`) so it works on Pages.

## Admin
- Visit `/#/admin` — password **10401040**
- Author in ChordPro; click **Download bundle** to export song + index.
- Drop `songs/*.chordpro` into `public/songs/` and merge `src/data/index.json`, or run:
```bash
npm run build-index
```

## Fonts for PDF
Put these files into `public/fonts/`:
- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`
- `NotoSans-Italic.ttf`
- `NotoSans-BoldItalic.ttf`
- `NotoSansMono-Regular.ttf`
- `NotoSansMono-Bold.ttf`

## Notes
- Home: search + tag filters, select-all/clear, per-song key, bundle builder at `/bundle`.
- Song page: vertical layout, sticky toolbar (transpose + download), chords toggle (ON by default), collapsible media.
- Setlist: `/setlist` lets you build/reorder sets, choose keys, export a single PDF.
- PDFs: vector text with Noto Sans; section titles are larger than lyrics and bold; sections kept together; auto 1→2 columns if one song overflows.
