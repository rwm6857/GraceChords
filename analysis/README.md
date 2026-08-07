# Spurgeon M&E ↔ M'Cheyne coverage analysis

A one-off, read-only analysis answering a single question: **for each day of the
M'Cheyne reading plan, how many of that day's chapters have a Spurgeon
*Morning and Evening* devotional keyed to them, and where are the gaps?**

Nothing here is application code. No schema, SQL, Supabase, or R2 changes were
made or are implied. Nothing under `apps/` or `packages/` was modified — this
directory only *reads* `packages/core`.

A second stage then turns that analysis into a concrete **daily assignment**: an
offline lookup table giving each of the 365 plan days 1 or 2 devotionals chosen
for relevance to that day's readings, so the app does nothing at runtime but a
date lookup.

## Output

Coverage analysis:

- [`out/coverage-report.md`](out/coverage-report.md) — how well the two sources overlap
- [`out/devotionals.json`](out/devotionals.json) — 732 parsed devotionals
- [`out/refs.csv`](out/refs.csv) — `key, slot, book, chapter, verse`, for re-checking the join by hand
- [`out/parse-log.txt`](out/parse-log.txt) — validation output from the last parser run

Daily assignment:

- [`out/daily-plan.md`](out/daily-plan.md) — **human-readable**: every day of the year, its readings, and the devotional scripture
- [`out/open-days.md`](out/open-days.md) — the days this corpus cannot fill, and why
- [`out/schedule.json`](out/schedule.json) — **the lookup table**: 365 days → 1–2 devotionals
- [`out/schedule-report.md`](out/schedule-report.md) — review report for the assignment
- [`out/schedule-overrides.json`](out/schedule-overrides.json) — hand corrections, applied on every run
- [`out/anchored-candidates.csv`](out/anchored-candidates.csv) — entries whose text ties them to a date or hour

## Re-running

```bash
node analysis/fetch_me.mjs        # -> analysis/ingest/ (gitignored)
node analysis/parse_me.mjs        # -> out/devotionals.json, out/parse-log.txt
node analysis/normalize_refs.mjs  # -> out/refs.csv, out/coverage-report.md
node analysis/scan_anchors.mjs    # -> out/anchored-candidates.csv
node analysis/build_schedule.mjs  # -> out/schedule.json, out/schedule-report.md
node analysis/build_daily_plan.mjs # -> out/daily-plan.md
```

Deterministic end to end from an empty `out/`. `parse_me.mjs` and
`build_schedule.mjs` both exit non-zero if a check fails. All sampling uses a
fixed-seed PRNG, so every report is byte-stable across runs.

## The assignment

**A devotional is paired to a day only when its own scripture falls inside what
the plan reads that day.** The day reading Genesis 1 gets a devotional built on
Genesis 1:4. Nothing else places anything — the entry's position in Spurgeon's
original calendar is ignored, there are no AM/PM semantics, and there are no
fillers. A day with no scripture match stays **open**.

Rules asserted at the end of `build_schedule.mjs`:

- no day holds more than 2 devotionals; `state` is `two`, `one`, or `open`
- no devotional is used twice in the year
- **every paired devotional references a chapter its day actually reads**
- no two devotionals on one day are keyed to the same verse
- no open day had an unused candidate that could have filled it
- every withheld entry appears nowhere in the schedule

16 entries are withheld from the pool outright. Because pairing is date-agnostic
there is no date placement to fall back on, so an entry tied to the calendar can
only be excluded: the 12 genuine calendar anchors, the 2 that back-reference a
partner entry which can never appear beside them, and the 2 Feb 29 entries (the
plan has no such day). Every devotional record carries `author` and `sourceWork`,
so content from other sources can be ingested alongside this corpus — the days it
cannot fill are listed in `out/open-days.md`.

Matching is a two-pass max-cardinality, max-weight bipartite assignment
(min-cost max-flow), not a greedy first-fit — greedy strands the days whose only
candidates are contested. Pass 1 maximises the number of days covered; pass 2
adds an optional second devotional, preferring one on a different chapter so the
pair covers more of the day's reading.

Edge scoring reflects how central a devotional is to the chapter **as actually
read that day**. Where the plan reads a verse-scoped subset, the devotional's
verse must fall inside it — without that rule Psalm 119 alone manufactures 60
matches on text the reader never reached.

To correct an assignment by hand, edit `out/schedule-overrides.json` and re-run;
the format is documented in `out/schedule-report.md`.

## Source material and licensing

The devotional text comes from the CCEL plain-HTML transcription at
`https://ccel.org/s/spurgeon/morn_eve/ME{MM}{AM|PM}.html`, which is marked
**"Public Domain — Copy Freely"**.

Deliberately **not** used: CCEL's PDF build (`morneve.pdf`), which carries
CCEL's own copyright requiring written permission for commercial use. The `/s/`
HTML files are the clean-licensed path.

`analysis/ingest/` is gitignored. **Do not commit the downloaded HTML.** Only
the parsers and their derived output are tracked.

## Design notes

Both sides of the join are parsed with the repo's own reference parser,
`packages/core/src/songs/verseRef.js`, rather than a reimplementation — so the
analysis and the shipped app share one book/reference vocabulary. If that parser
has a quirk, this analysis reproduces it instead of papering over it.

Three properties of the source drove most of the parser's complexity; each is
documented at the top of `parse_me.mjs`:

1. A leading `--` does **not** identify a reference. 739 lines start with `--`;
   only 735 are references. The other 4 are body prose using `--` as an em-dash.
   References are discriminated by right-padding (indent ≥ 20), not the prefix.
2. Two entries (`07-12-AM`, `08-30-PM`) carry multiple core text/reference pairs.
3. Indentation cannot mark the header/body boundary — paragraph indents vary
   between 2 and 4 spaces, and `09-28-AM`'s first body paragraph has none at
   all. The boundary is anchored on the reference cluster instead.

Italics are markdown-style underscores in the source and are **preserved
byte-for-byte** in `body`; `bodyPlain` carries the same text with underscores
removed. End-of-line hyphens are genuine hyphenated compounds, so lines are
joined without a space and the hyphen is kept — all 18 such joins are listed in
`out/parse-log.txt` for spot-checking.
