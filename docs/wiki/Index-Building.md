# Index Building

`scripts/buildIndex.mjs` scans `public/songs/*.chordpro` and writes `src/data/index.json`.

## Run
```bash
npm run build-index
```

## Extracted Metadata
- `id` (from `{id:}` or sanitized title)
- `title`
- `key`
- `tags`
- `authors`
- `country`

## Common Errors
- Missing song file
- Malformed header line
- File not saved with `.chordpro`

Re-run after editing songs so [[Search-and-Tags]] stays updated.
