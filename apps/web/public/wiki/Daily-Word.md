Daily Word is the Bible reading view at `/reading`. It follows Robert Murray M'Cheyne's plan and uses local Bible text (no external API).

## Using Daily Word
- Open `/reading` from the navbar ("Daily Word").
- The date selector controls which day of the plan is shown.
- Passage chips list the expanded readings for that day. Tap or click a chip to jump to that passage.
- Swipe left/right in the reading area to move between passages.

## Verse Selection & Copy
- Click a verse to toggle selection. Multi-select is supported.
- The floating copy button appears when the current passage has selected verses.
- Copy includes **only the current passage** (even if other passages have selections).
- Formatting uses the existing verse compression logic (ranges and commas).

## Daily Persistence
Selections are saved per calendar date in local storage and persist across passages:
- Returning later the same day restores your selections.
- Selections reset automatically when the date changes.

## Data & Build
Daily Word uses local chapter JSON generated from XML files in `BIBLE_XML/`.
- Import all translations with `npm run build:bibles`
- Import a single translation with `npm run build:bible -- --xml ./BIBLE_XML/FILE.xml`
- `npm run build` does not run Bible ingestion automatically

Related:
[[Development-Commands]] [[Project-Structure]]
