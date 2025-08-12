# Project Structure

Understanding where things live helps when contributing. See [[Getting-Started]] for setup.

```
/ (repo root)
├── src/        React components, routes, utils
├── public/     Static assets and `songs/*.chordpro`
├── docs/       Built site served by GitHub Pages
├── scripts/    Node helpers like `buildIndex.mjs`
└── docs/wiki/  This wiki's source files
```

Key directories under `src/`:
- `components/` — route pages such as `Home`, `SongView`, `Setlist`, `Admin`
- `data/` — generated index of songs
- `utils/` — parsing, PDF helpers, etc.

Static songs are stored in `public/songs/`. During `npm run build` they copy to `docs/songs/`.
