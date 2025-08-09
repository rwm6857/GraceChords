# GraceChords (ChordPro + Admin)

## Run locally
```bash
npm install
npm run dev
```

## Deploy to GitHub Pages
1) Edit `vite.config.js` and set `base: '/<your-repo>/'` (e.g. `/GraceChords/`).
2) `npm run build`
3) `npm run deploy`
4) Pages will serve at `https://<username>.github.io/<your-repo>/`

## Admin page
- Visit `/#/admin` to edit songs.
- Use ChordPro syntax: chords inline like `[G]Amazing`.
- Click **Download bundle** to get `songs/*.chordpro` and an updated `src/data/index.json`.
- Commit those to your repo and deploy.

## Offline bulk workflow
1) Place many `.chordpro` files into `public/songs/`
2) Run `npm run build-index`
3) Commit `src/data/index.json` and deploy

## PDF
- Vector, selectable text via jsPDF.
- Chords placed above exact words using text width positioning.
