# Daily Word Reader

`DailyWordScreen` reads the day's M'Cheyne passages from Cloudflare R2.

## Data
- Plan lookup, reading expansion, translation manifest, RTL, and chapter/copy
  helpers live in core's `bible` module (base URL injected).
- `src/lib/bibleSource.ts` is the **single source seam** (`getPassage`,
  `getTranslations`) via `EXPO_PUBLIC_R2_PUBLIC_URL` (default
  `https://assets.gracechords.com`). It is **offline-first**: `getPassage` returns a
  downloaded chapter when one exists (`src/lib/downloads/`) and falls back to R2.
- Hooks: `useBibleTranslations`, `usePassageChapter` (`src/lib/useReader.ts`).
- The Bible translation pick (`bibleTranslationPref.ts`) is independent of UI
  language; see the i18n section of `apps/mobile/AGENTS.md`.

## Reader settings
Size/typeface/layout/spacing persist device-local in `src/lib/readerSettings.ts`
(`gc.reader.settings.v1`, hydrated in the splash batch) — they are readability
preferences, so they outlive the reader, a relaunch and an app update. The
settings sheet stays controlled (reports via `onChange`; the screen writes the
store). Parsing is per-field, so a corrupt record only loses the bad fields.

## Scroll position
Per passage chip, session-scoped. Offsets live in refs in `DailyWordScreen` (a
scroll never re-renders the reading): chips open at the top, returning restores
the offset, closing the reader resets all. The `ScrollView` is keyed on the
passage id so a chapter never inherits its predecessor's offset; the saved offset
is re-applied on the first `onContentSizeChange` after a passage change.

## Verse numerals (`VerseNumber.tsx`)
- Numerals are **inline `<View>`s, not nested `<Text>`**. RN has no per-run
  baseline offset; an inline view is the one thing both text engines position
  relative to the baseline. Metrics live in `readerSettings.ts` and are tested to
  stay shorter than the line's ascent at every size/spacing pair.
- The numeral is joined to its first word with a **no-break space** and sits
  **outside** the highlight run (an inline view takes no text background).
- Every reading paragraph must **open with `PARAGRAPH_ANCHOR`** (U+2060) before the
  numeral: iOS reads paragraph line height from the first character, and an inline
  view carries no paragraph style — without the anchor, Line spacing silently
  stops working.

## Chapter swipe (`ChapterSwipe.tsx`)
- Reanimated + RNGH. The page tracks the finger; a chevron pill slides in from the
  edge and **illuminates** (accent fill) once past the commit threshold, firing
  **one** light haptic (re-arms if dragged back). Release past it carries the page
  off and commits; short of it, it springs back. At the first/last reading the
  drag rubber-bands with no pill or haptic.
- The neighbouring chapter is not rendered during the drag. The entrance animation
  replays for **every** content change (`contentKey`), so chip taps and translation
  switches fade too.
- Pills are geometric, not semantic (right edge always `chevron.right`), and
  decorative (`pointerEvents="none"`, hidden from assistive tech) — the chapter
  chips are the accessible navigation.
- **Drag math is `src/lib/readerSwipe.ts`** (threshold, over-drag slowing, rubber
  band, flick-to-commit) — pure worklets, unit-tested. Tune numbers there; the
  component keeps only animation timings.
- **Don't wrap the pills in `GlassSurface`**: their opacity animates to 0, which
  the glass material can't survive.
- `DailyWordScreen` prefetches the chapters either side of the current one so a
  committed swipe lands on text (`prefetchToday` only warms today in the default
  translation).
