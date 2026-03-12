Generate the searchable song index from ChordPro files.

## At a glance
- `scripts/buildIndex.mjs` reads metadata
- Output saved to `src/data/index.json`
- Run with `npm run build-index`
- Before building, normalize names with `npm run normalize`
- Warns on missing fields
- Ignores files prefixed with `test_*.chordpro`
- Supports translation metadata via `{song_id: ...}` + `{lang: ...}` (`en` default when `lang` is omitted)
- Applies metadata inheritance from English source variant unless translation provides non-empty override
- Sorting: numeric titles first; otherwise by title with leading punctuation ignored (e.g., `'Tis` sorted under `T`)

```bash
npm run normalize && npm run build-index
```
Warnings highlight songs missing titles, keys, or tags so they can be fixed.

Translation/index rules
- Canonical language field is `{lang: ...}`. Legacy aliases are accepted during migration (`language`, `locale`, `eng/tur/spa`, etc.).
- Canonical grouping field is `{song_id: ...}`. Legacy aliases are accepted (`songid`, `translation_group`, `translation_of`).
- Each indexed song gets:
  - `songId` for translation grouping
  - `language` for chip/filter behavior
- Output root includes `languages` plus `items`.
- Language chips in the app only show languages that appear in at least one true translation group (2+ variants sharing the same `songId`).

Metadata inheritance rules
- English variant is master when present.
- Inherited when translation does not provide a non-empty override:
  - `originalKey`, `tags`, `authors`, `country`, `youtube`, `mp3`, `pptx`
- Empty or blank translation values inherit from English.

Sorting rules
- Titles beginning with digits are listed first.
- For others, leading punctuation is ignored during sorting so `'Tis So Sweet…` is grouped with `T`.
- Sorting is case‑insensitive.

[[Project-Structure]]
