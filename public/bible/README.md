# Bible Translation Data

GraceChords loads Bible text using a manifest + chapter JSON files.

## Manifest

`public/bible/translations.json`

```json
{
  "defaultTranslation": "esv",
  "translations": [
    {
      "id": "esv",
      "label": "ESV",
      "name": "English Standard Version",
      "language": "en",
      "dataRoot": "bible/en/esv"
    }
  ]
}
```

- `id`: stable translation key (used in verse IDs and URLs)
- `label`: short UI label
- `name`: full translation name
- `language`: BCP-47-ish language code (for filtering/grouping)
- `dataRoot`: folder under `public/` where chapter JSON files live

## Chapter JSON format

Each chapter file should match:

```json
{
  "book": "John",
  "chapter": 3,
  "verses": {
    "16": "For God so loved the world..."
  }
}
```

Recommended path for a translation:

- `public/bible/<language>/<translation-id>/<Book>/<Chapter>.json`

Current ESV path:

- `public/bible/en/esv/<Book>/<Chapter>.json`

## Ingesting XML

- ESV convenience command:
  - `npm run build:esv`
- Generic importer:
  - `npm run build:bible -- --xml ./FILE.xml --id <translation-id> --lang <language-code> --label <short> --name "<full name>"`

The generic importer supports schema modes:
- `auto` (default)
- `esv` (Crossway-style `<b>/<c>/<v>`)
- `osis` (OSIS-like `<chapter>/<verse>` with `osisID`)
- `generic` (best-effort `<book>/<chapter>/<verse>`)
