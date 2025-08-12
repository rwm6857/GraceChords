Generate the searchable song index from ChordPro files.

## At a glance
- `scripts/buildIndex.mjs` reads metadata
- Output saved to `src/data/index.json`
- Run with `npm run build-index`
- Warns on missing fields

```bash
npm run build-index
```
Warnings highlight songs missing titles, keys, or tags so they can be fixed.

[[Project-Structure]]
