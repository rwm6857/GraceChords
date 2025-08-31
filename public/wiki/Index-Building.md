Generate the searchable song index from ChordPro files.

## At a glance
- `scripts/buildIndex.mjs` reads metadata
- Output saved to `src/data/index.json`
- Run with `npm run build-index`
- Warns on missing fields
 - Ignores files prefixed with `test_*.chordpro`
 - Sorting: numeric titles first; otherwise by title with leading punctuation ignored (e.g., `'Tis` sorted under `T`)

```bash
npm run build-index
```
Warnings highlight songs missing titles, keys, or tags so they can be fixed.

Sorting rules
- Titles beginning with digits are listed first.
- For others, leading punctuation is ignored during sorting so `'Tis So Sweet…` is grouped with `T`.
- Sorting is case‑insensitive.

[[Project-Structure]]
