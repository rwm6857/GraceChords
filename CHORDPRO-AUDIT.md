# GraceChords ChordPro Conformance Audit

**Date:** 2026-08-30 · **Branch:** `claude/chordpro-format-audit-ei6wpo` · **No code was changed.**

## Purpose of this document

This is a factual description of how the GraceChords monorepo parses, renders, and rewrites
ChordPro. It exists to be **diffed against the official ChordPro specification**
(<https://www.chordpro.org/chordpro/chordpro-directives/>) by a reader or an agent that has
the spec available.

**How to use it:** for each directive and syntax rule in the spec, find the corresponding row
in §4 / §5 below and compare. Rows marked `MIS-READ` or `DROPPED` are the divergences. §3
gives the exact grammar so ambiguous cases can be resolved without reading source.

**Evidence standard:** every behaviour labelled *verified* was produced by executing the real
implementation — `packages/core/src/chordpro/{parser,serialize,lint}.ts` under Node 22
type-stripping — against the input shown. Render behaviour (§7) was read from source:
`node_modules` was not installed in the audit environment, so jsPDF and canvas engines could
not be executed.

**What this document is not:** it is not a bug list to action, not a proposal, and not
prioritised for fixing. Severity labels describe user-visible content loss only.

---

## 1. Scope: every place ChordPro is read

| # | Module | Role | Notes |
|---|---|---|---|
| 1 | `packages/core/src/chordpro/parser.ts` → `parseChordProOrLegacy()` | **Canonical parser** | The only parser that produces `SongDoc`. All three apps call it. |
| 2 | `packages/core/src/chordpro/serialize.ts` → `serializeChordPro()` | Canonical serializer | Used by `canonicalizeForm()` on every editor save. |
| 3 | `packages/core/src/chordpro/lint.ts` → `lintChordPro()` | Linter | Bridged into Studio; **not surfaced in any UI**. |
| 4 | `packages/core/src/chordpro/index.js` → `parseChordPro()` | Pre-`parser.ts` implementation | Different output shape (`{meta, blocks}` with `text`/`chords`). Reachable only via `normalizeSongInput()`'s string branch, which no shipping caller exercises. Handles `[VERSE]` bracket headers, which `parser.ts` does not. Its transposition helpers in the same file **are** load-bearing everywhere. |
| 5 | `apps/web/src/pages/portal/EditorPage.jsx` (`handleImportFile`) | Import-file directive scanner | Independent vocabulary; never calls the shared parser. See §9. |
| 6 | `packages/core/src/songs/pdfImport.ts` | Positioned PDF text → ChordPro draft | Studio only. Widest heading vocabulary in the repo. |
| 7 | `apps/web/scripts/exportAllJpgs.mjs:290–520` | Hand-copied fork of `parser.ts` | In sync today; nothing enforces it. Script is dead (§10). |
| 8 | `apps/studio/.../Resources/GraceChordsCore.js` | Committed esbuild bundle of core, run in JavaScriptCore | In sync today; `apps/studio/js/verify-bundle.mjs` checks parity but **is not run in CI**. |
| 9 | `apps/studio/.../ChordProHighlighter.swift` | Swift re-implementation, editor syntax colouring only | Deliberate, documented exception; affects no saved data. |

### Consumers of `parseChordProOrLegacy()`

- **Web:** `SongViewPage`, `WorshipModePage`, `SessionViewerPage`, `SetlistPage`, `SongbookPage`, `BundlePage`, `utils/pdf_mvp/serverSong.js`
- **Mobile:** `app/viewer/[slug].tsx`, `PerformerScreen`, `SessionFollowerScreen`, `SongEditorScreen` (preview)
- **Studio:** via `CoreBridge.parse` / `CoreBridge.render`
- **Workers:** `workers/telegram-bot/src/pdfRender.js`
- **Core-internal:** `lint.ts`, `convert.ts`, `songAuthoring.ts` (`canonicalizeForm`), `pdfImport.ts`

---

## 2. Data model produced by the parser

`packages/core/src/chordpro/types.ts`:

```ts
type ChordPlacement = { sym: string; index: number }   // index = UTF-16 offset into lyrics
type InstrumentalDirective = { chords: string[]; repeat?: number }
type SongLine = { lyrics: string; chords: ChordPlacement[]; comment?: string; instrumental?: InstrumentalDirective }
type SongSection = { kind: string; label?: string; lines: SongLine[]; instrumental?: InstrumentalDirective }
type SongMeta = { title?: string; key?: string; capo?: number; meta?: Record<string,string> }
type SongLayoutHints = { requestedColumns?: 1 | 2; columnBreakAfter?: number[] }
type ChordDefine = { name: string; raw: string }
type SongDoc = { meta: SongMeta; sections: SongSection[]; layoutHints?: SongLayoutHints; chordDefs?: ChordDefine[] }
```

`kind` values in practice: `verse`, `chorus`, `bridge`, `intro`, `tag`, `outro`, `comment`, `instrumental`.

**Write-only fields** — populated on every parse, mirrored into Studio's Swift `SongDoc`, and read
by **no renderer on any platform**: `layoutHints`, `chordDefs`, `meta.meta`. `meta.capo` is read
only to build a text subtitle on the web song page.

---

## 3. Grammar (exact)

### 3.1 Regex constants — `packages/core/src/chordpro/parser.ts`

```js
RX_LONG_DIR     = /^\{(start_of|end_of)_(verse|chorus|bridge|intro|tag|outro)(?::\s*([^}]+))?\}$/i
RX_SHORT_DIR    = /^\{\s*(sov|eov|soc|eoc|sob|eob)(?::?\s*([^}]+))?\s*\}$/i
RX_CAPO         = /^\{capo:\s*(\d+)\}$/i
RX_COLUMNS      = /^\{columns:\s*(\d+)\}$/i
RX_COL_BREAK    = /^\{column_break\}$/i
RX_COMMENT      = /^\{\s*(c|comment|com|ment)(?=\s|:)(?::?\s*([^}]+))?\s*\}$/i
RX_INSTRUMENTAL = /^\{\s*(instrumental|inst|i)(?=\s|:|})(?::?\s*([^}]+))?\s*\}$/i
RX_DEFINE       = /^\{define:\s*([^}]+)\}$/i
RX_PLAIN_HEADER = /^(verse|chorus|bridge|intro|tag|outro)(?:\s+(\d+))?$/i
RX_META         = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}$/
RX_CHORD        = /\[([^\]]+)\]/g
```

Note `RX_LONG_DIR` has **no `\s*` after `{`** — a padded `{ start_of_verse: V }` fails it and
falls through to `RX_META`, becoming metadata rather than a section. `RX_SHORT_DIR`,
`RX_COMMENT`, `RX_INSTRUMENTAL` and `RX_META` all tolerate padding.

### 3.2 Line dispatch order

The document is split on `/\r?\n/`. Each line is trimmed and tested in this order; **first match
wins and consumes the line**.

| Order | Test | Result |
|---|---|---|
| 1 | `^#` | Discarded outright. Nothing inside is read, including `[chords]`. |
| 2 | empty line | Emits `{lyrics:"", chords:[]}` into the **open** section; ignored if no section is open. |
| 3 | `RX_CAPO` | `meta.capo = parseInt(n, 10)` |
| 4 | `RX_COLUMNS` | `layoutHints.requestedColumns = (n === 2 ? 2 : 1)` |
| 5 | `RX_COL_BREAK` | Pushes `doc.sections.length` (count of *closed* sections) onto `columnBreakAfter`. |
| 6 | `RX_COMMENT` | Emits a standalone `kind:"comment"` section via `insertStandaloneSection()`. Empty value ⇒ line dropped. |
| 7 | `RX_INSTRUMENTAL` | Emits a standalone `kind:"instrumental"` section. |
| 8 | `RX_DEFINE` | Pushes `{name, raw}` onto `chordDefs`. |
| 9 | `RX_META` **and not** `RX_LONG_DIR` **and not** `RX_SHORT_DIR` | `title`/`key`/`capo` promoted to `SongMeta`; `meta` split on first whitespace run into `meta.meta[name]`; everything else → `meta.meta[key.toLowerCase()] = value`. |
| 10 | *(only if `hasEnv`)* `RX_LONG_DIR` / `RX_SHORT_DIR` | Open or close a section. |
| 11 | `^{…}$` | **Silently discarded.** |
| 12 | *(only if `!hasEnv`)* `RX_PLAIN_HEADER` | Opens a section. |
| 13 | anything else | Lyric line. `RX_CHORD` extracts chords; if no section is open, an unnamed `verse`/`"Verse"` is auto-created. |

### 3.3 The `hasEnv` global switch

Before parsing, the whole file is scanned once:

```js
for (const L of lines) { if (RX_LONG_DIR.test(L.trim()) || RX_SHORT_DIR.test(L.trim())) { hasEnv = true; break } }
```

This single boolean selects between two **mutually exclusive** modes for the entire document.
There is no mixed mode, and nothing warns.

- `hasEnv === true` → environment directives active, `RX_PLAIN_HEADER` **never consulted**.
- `hasEnv === false` → plain headers active, environment directives (by definition) absent.

### 3.4 `insertAtCursor` side effect — trailing empty sections

`{c:}` and `{instrumental}` directives inside an open section call `insertStandaloneSection()`,
which closes the current section, emits the standalone one, and **re-opens a clone** of the
original. If nothing follows, the clone is emitted with zero lines. iOS and Studio filter
line-less sections; web surfaces do not (§8).

### 3.5 Section-header vocabularies (three, plus two more in ancillary code)

| Where | Accepts | Effect |
|---|---|---|
| `parser.ts` `RX_PLAIN_HEADER` / `RX_LONG_DIR` | `verse, chorus, bridge, intro, tag, outro` | The **only** vocabulary that creates a section. |
| `SongViewPage.jsx:868` `isSectionLabel` and `pdf_mvp/pure.js:256` `isHeaderLike` (byte-identical regex, two files) | + `pre-chorus, ending, refrain` | Render-time rescue: a chord-less lyric line matching this is drawn as `[HEADER]`. Web song page and PDF **only**. |
| `songs/pdfImport.ts:243` `RX_HEADING` | + `interlude`, and bracketed `[VERSE 1]` / parenthesised `(Chorus)` / colon-suffixed `CHORUS:` / `(2x)`-annotated forms | Studio PDF import only. |
| `scripts/convertChordProAll.mjs:11` | + `ending`→`outro`, `refrain`→`chorus` | Dead script. |
| `ChordProHighlighter.swift` | transcribed copy of `parser.ts` | Colouring only. |

Regex for rows 2/3:

```js
// SongViewPage.jsx:868 === pdf_mvp/pure.js:256
/^(?:verse(?:\s*\d+)?|chorus|bridge|tag|pre[-\s]?chorus|intro|outro|ending|refrain)\s*\d*$/i

// pdfImport.ts:243
/^[[(]?\s*(verse|chorus|pre[-\s]?chorus|bridge|intro|outro|tag|interlude|refrain|ending)(?:\s+(\d+))?\s*[.:]?\s*[\])]?(?:\s*\([^)]{1,12}\))*\s*$/i
```

`SECTION_PRESETS` (`packages/core/src/chordpro/editing.ts:73`) is the shared editor mapping and
already encodes the constraint: **Pre-Chorus and Interlude are emitted as named choruses**
(`{start_of_chorus: Pre-Chorus}`), because the parser accepts no other environment.

---

## 4. Directive matrix vs. the specification

Status legend:

- `RENDERED` — parsed and drawn by at least one surface
- `PARSED-ONLY` — reaches `SongDoc`, no renderer reads it
- `MIS-READ` — becomes something other than what the spec means
- `DROPPED` — silently discarded

### 4.1 Meta-data

| Spec directive | Status | Behaviour |
|---|---|---|
| `{title: …}` | RENDERED | → `meta.title`. Used as page/PDF title when present, else the `songs.title` column. **`{t: …}` is NOT recognised** — no short-form aliases exist; `t` lands in `meta.meta`. |
| `{subtitle}`, `{st}` | DROPPED | → `meta.meta`, read by nothing, deleted on next save (§6). |
| `{artist}`, `{composer}`, `{lyricist}` | DROPPED | Same. Authorship lives in `songs.artist`. Only the *import-file* path (§9) maps these into form fields. |
| `{album}`, `{year}`, `{copyright}`, `{ccli}`, `{sorttitle}`, `{duration}` | DROPPED | Same. `EditorPage.jsx:251` lists these explicitly as "ignore silently". |
| `{key: …}` | RENDERED | → `meta.key`. Seeds the transpose baseline. **Precedence differs between viewers and exports** — see §8. Empty value `{key: }` yields `key: ""`. |
| `{time: …}` | DROPPED | → `meta.meta`. The editor has its own `time_signature` DB column. |
| `{tempo: …}` | DROPPED | → `meta.meta`. Own `tempo` DB column. |
| `{duration: …}` | DROPPED | → `meta.meta`. |
| `{capo: N}` | PARSED-ONLY | → `meta.capo`. Displayed as text in the web song page subtitle only. Never adjusts chords. Not drawn in PDF, JPG, iOS or Studio. **Lenient**: `{capo: 2nd fret}` falls to `RX_META` → `parseInt` → `2`. `{capo: abc}` → `NaN`, which `typeof === 'number'`, so serialization re-emits `{capo: NaN}`. `{capo: -2}` accepted via the same path. |
| `{meta: name value}` | PARSED-ONLY | Split on first whitespace run into `meta.meta[name]`. Never read. |

### 4.2 Formatting

| Spec directive | Status | Behaviour |
|---|---|---|
| `{comment: …}`, `{c: …}` | RENDERED | Standalone comment section. Italic + muted on every surface. **Blank in server-rendered PDFs** (§8). Also accepts the non-standard aliases `{com …}` and `{ment …}` — an artefact of the alternation `(c\|comment\|com\|ment)`. Bare `{c}` / `{comment}` with no value is DROPPED. Padded `{ c : hi }` produces comment text `": hi"` — the colon leaks into the value because `:?` matches empty before `\s*`. |
| `{comment_italic: …}`, `{ci: …}` | DROPPED | Alias table stops at `c`/`comment`/`com`/`ment`; the `_` after `comment` fails the `(?=\s\|:)` lookahead. → `meta.meta`. |
| `{comment_box: …}`, `{cb: …}` | DROPPED | Same. |
| `{highlight: …}` | DROPPED | → `meta.meta`. |
| `{image: …}` | DROPPED | → `meta.meta`. No renderer draws images. |

### 4.3 Environments

| Spec directive | Status | Behaviour |
|---|---|---|
| `{start_of_verse}` / `{sov}`, `{start_of_chorus}` / `{soc}`, `{start_of_bridge}` / `{sob}` and their `end_of_` / `eov`/`eoc`/`eob` forms | RENDERED | Full support. Case-insensitive. Short forms accept a label with or without the colon (`{sov Verse 1}` and `{sov: Verse 1}` both work). Labels on `end_of_*` are parsed and ignored. |
| `{start_of_intro}`, `{start_of_tag}`, `{start_of_outro}` | RENDERED | **Long form only** — there are no `{soi}`/`{sot}`/`{soo}` shorthands. `{sot}` in particular collides with the spec's *start-of-tab*. |
| `{start_of_verse Verse 1}` (spec's space-separated label form, long directive) | MIS-READ | `RX_LONG_DIR` requires `:` before a label, so this fails; no colon means `RX_META` also fails; the line is DROPPED. The following lyric auto-opens an unnamed `verse` labelled `"Verse"`, so **the section survives by accident and the label is lost**. |
| `{ start_of_verse: V }` (padded) | MIS-READ | `RX_LONG_DIR` has no leading `\s*`; falls to `RX_META` → `meta.meta["start_of_verse"] = "V"`. Content merges into an auto-opened unnamed Verse. Same for `{start_of_verse : V}`. |
| `{chorus}` | DROPPED | The spec's "repeat the chorus here" marker vanishes without trace. The reader loses the instruction entirely. |
| `{start_of_tab}` / `{sot}` / `{eot}` | MIS-READ | Delimiters dropped; **tab content is emitted as ordinary lyric lines** — proportional font, wrapped to column width, alignment destroyed. |
| `{start_of_grid}` / `{sog}` / `{eog}` | MIS-READ | Same. `\| G . . . \| C . . . \|` becomes a lyric line. |
| `{start_of_abc}`, `{start_of_ly}`, `{start_of_svg}`, `{start_of_textblock}` | MIS-READ | Same — content becomes lyrics. |
| Any other `{start_of_X: label}` | MIS-READ | Matches `RX_META` → `meta.meta["start_of_x"]`. Affects `pre_chorus`, `interlude`, `part`, and anything custom. A round-trip re-emits it in the metadata block as a pseudo-directive. |

### 4.4 Chord diagrams

| Spec directive | Status | Behaviour |
|---|---|---|
| `{define: …}` | PARSED-ONLY | Whole body captured into `chordDefs[]` as `{name: firstToken, raw: "define: …"}`. Re-serialised verbatim. **No renderer draws a diagram on any platform.** Deleted on save. |
| `{chord: …}` | DROPPED | → `meta.meta`. |

### 4.5 Output / page layout

| Spec directive | Status | Behaviour |
|---|---|---|
| `{columns: N}` | PARSED-ONLY | `N === 2` → 2; **any other value → 1**, including `{columns: 3}`. Only `utils/media/jpgPlanner.js` reads `layoutHints.requestedColumns`, and `SongViewPage.buildSong()` does not pass `layoutHints` to it. Never reaches PDF, iOS or Studio. |
| `{col: N}` | DROPPED | Shorthand not recognised → `meta.meta["col"]`. |
| `{column_break}` | PARSED-ONLY | Same dead end. `jpgPlanner.js` contains **two** packers honouring breaks in two incompatible encodings: `packIntoColumnsLegacy` expects a section with `type:"column_break"` (never produced); `packIntoColumns` expects a `breakBefore` flag (produced only by the unreachable `planSongLayout`). Index recorded is `doc.sections.length` at directive time, i.e. sections *closed* so far — mid-section it records the wrong index. |
| `{colb}` | DROPPED | Only the long form is matched. |
| `{new_page}` / `{np}`, `{new_physical_page}` / `{npp}` | DROPPED | Page breaks are entirely engine-chosen. |
| `{new_song}` / `{ns}` | DROPPED | Multi-song files are not a concept — one DB row, one song. |
| `{titles}`, `{pagetype}`, `{footer}` | DROPPED | Metadata or discarded. |

### 4.6 Fonts, sizes, colours

| Spec directive | Status | Behaviour |
|---|---|---|
| `{textfont}`, `{textsize}`, `{textcolour}`, `{chordfont}`, `{chordsize}`, `{chordcolour}`, `{tabfont}`, `{tabsize}`, `{tabcolour}`, `{gridfont}`, … | DROPPED | All → `meta.meta`, deleted on next save. Typography is fixed per surface. |

### 4.7 Transposition, conditionals, substitution

| Spec feature | Status | Behaviour |
|---|---|---|
| `{transpose: N}` | DROPPED | → `meta.meta`. Transposition is a live user control, never a file property. |
| Instrument/format selectors — `{comment-guitar: …}`, `{title-tab: …}` | DROPPED | The suffix makes the name unrecognised → `meta.meta["comment-guitar"]`. |
| `%{title}` metadata substitution | MIS-READ | Not implemented. The literal text is drawn. |
| Conditional directive prefixes generally | DROPPED | No support. |

### 4.8 House extensions (NOT in the specification)

| Directive | Status | Behaviour |
|---|---|---|
| `{instrumental: G, C, D x2}`, `{inst …}`, `{i …}` | RENDERED | Chord-only row. Chords joined with `"  //  "`; repeat count appended to the last chord of the last row (`D x2`). Accepts comma- **or** space-separated chords and a trailing `xN` either attached to a chord or standalone. Splits over two rows when `split` is set (two-column layouts only). Bare `{i}` yields an empty instrumental section. Padded `{ instrumental : G, C }` leaks the colon into the first chord: `[": G", "C"]`. |
| `{com …}`, `{ment …}` | RENDERED | Undocumented comment aliases; regex artefact. |

---

## 5. Chord and bracket syntax

Extraction is one global regex: `RX_CHORD = /\[([^\]]+)\]/g`. **Anything non-empty between
square brackets is a chord**, removed from the lyric text and recorded at the character offset
where it stood. No validation at parse time, no escape mechanism.

| Input | Lyric produced | Chords produced | Verdict |
|---|---|---|---|
| `[G]Amazing [C]grace` | `Amazing grace` | `G@0`, `C@8` | intended case |
| `Meet me at [the] river` | `Meet me at  river` | `the@11` | **CONTENT LOST** — a bracketed English word is deleted from the lyric |
| `[Verse 1]` | `` (empty) | `Verse 1@0` | **CONTENT LOST** — bracket headers are chords |
| `[*Softly]` | `` (empty) | `*Softly@0` | spec annotation syntax becomes a chord symbol; survives transposition (no A–G start) and is drawn in the chord font |
| `[]spacing` | `[]spacing` | none | spec's empty chord needs ≥1 char here, so brackets are drawn literally |
| `[  ]word` | `word` | `"  "@0` | two-space chord symbol recorded, drawn as blank width |
| `Unclosed [C` | `Unclosed [C` | none | safe failure |
| `[G][C]Word` | `Word` | `G@0`, `C@0` | web/PDF nudge the second right by one space width; iOS/Studio join them with a space over the same word |
| `[G7sus4] [C#m7b5] [N.C.] [%] [\|]` | — | all verbatim | no symbol validation |
| `Şükür with [G]chords` | — | UTF-16 offsets | Studio converts at the Swift boundary; parity harness covers Turkish, Korean, emoji surrogate pairs |

### 5.1 Transposition corrupts bracketed prose (verified)

`transposeSymPrefer` (`chordpro/index.js:58`) matches `^([A-G])([#b]?)(.*)$` and rewrites only
the first letter, appending the remainder untouched. Correct for `Bbmaj7`, wrong for anything
that merely *begins* with a note letter:

```
+2 semitones:
  [Chorus]       -> Dhorus
  [Bridge]       -> C#ridge
  [Ending]       -> F#nding
  [Ad lib]       -> Bd lib
  [Guitar solo]  -> Auitar solo
  [Fade out]     -> Gade out
  [Verse 1]      -> Verse 1     (V is not A-G, safe)
  [*Softly]      -> *Softly     (* is not A-G, safe)
```

At the original key this is easy to miss: `[CHORUS]` renders in bold monospace above an empty
line, which reads as a section header at a glance. `packages/core/src/chordpro/index.js:8–17`
(the older parser) *does* handle `[VERSE]` correctly, with a bracket-only test that excludes
chord-shaped tags. That logic was not carried into `parser.ts`.

### 5.2 Other unexpected-text handling

- Tab / grid / ABC / LilyPond content → lyrics (see §4.3).
- A directive-shaped string **mid-line** (`Some lyric {c: text} more`) is left alone. Only whole-line braces are directives. **Matches the spec.**
- A lyric line that happens to be exactly `{word: value}` is absorbed as metadata and disappears from the song.
- Nested braces `{x: {y}}` fail `RX_META` (`[^}]*` cannot span the inner `}`) and are DROPPED.
- Trailing whitespace and tabs in lyric lines are **preserved** into the render (`white-space: pre` on web), so a stray tab shifts chord alignment.
- A stray `{end_of_verse}` closes the current section harmlessly. `lintChordPro` reports it (`warn:section_mismatch`); nothing surfaces the report.
- `\r\n` is normalised. A trailing newline produces a trailing empty line in the last section.

### 5.3 Linter false positives (verified)

`lint.ts:6`:

```js
RX_CHORD_VALID = /^[A-G](?:#|b)?(?:(?:maj|min|m|dim|sus|add)?\d*)?(?:\/[A-G](?:#|b)?)?$/
```

No `aug` alternative, no altered extensions, no parentheses, no post-slash quality. Emits
`warn:unknown_chord` for chords every renderer draws correctly:

```
FLAGGED: Am7b5  F#m7b5  D7sus4  E7#9  G6/9  Aaug  Am(add9)  N.C.  G°  Bø7  C-
PASSES:  G  Am  C#m7  Bb  G/B  Dsus4  Amaj7  C9  Gadd9  Bbmaj7  G5  Ddim7  Csus  Gm/Bb  A/C#  Bsus2  Cmaj9
```

Other lint rules: `warn:missing_title`, `warn:missing_key`, `warn:empty_section`,
`warn:long_line` (>90 chars), `warn:duplicate_section_header`, `warn:section_mismatch`.
The linter is bridged into Studio (`CoreBridge.lint`) and **wired into no UI on any platform**.

---

## 6. Save-time rewriting (largest source of silent loss)

Both editors call `canonicalizeForm()` (`packages/core/src/songs/songAuthoring.ts:139`) on every
save — web `EditorPage.jsx:427,515`, mobile `useSongDraft.ts:66,98`:

```ts
const doc = parseChordProOrLegacy(body)
const text = serializeChordPro(doc, { useDirectives: true, includeMeta: false })
```

`serialize.ts:144` — `const head = includeMeta ? metaLines.join('\n') : ''` — discards the entire
metadata block: `{title}`, `{key}`, `{capo}`, every `chordDefs` entry, `{columns: 2}`, and every
`meta.meta` key. `#` comment lines were already dropped at parse time. `{column_break}` is emitted
inside the body loop and **survives, orphaned from the `{columns: 2}` that gave it meaning**.

### Verified round trip

Input:

```chordpro
{title: Sample Worship Song}
{ccli: 7654321}
{copyright: 2020 Some Publishing}
{capo: 2}
{columns: 2}
{define: G base-fret 1 frets 3 2 0 0 0 3}
# tracked from the WT chart
{start_of_pre_chorus: Pre-Chorus}
[F]Pre chorus text
{end_of_pre_chorus}
{column_break}
{start_of_verse: Verse 1}
[G]Amazing [C]grace
{end_of_verse}
```

Output after one save:

```chordpro
{start_of_verse: Verse}
[F]Pre chorus text
{end_of_verse}

{column_break}

{start_of_verse: Verse 1}
[G]Amazing [C]grace
{end_of_verse}
```

Lost: `title`, `ccli`, `copyright`, `capo`, `columns`, `define`, the `#` comment, and the
`Pre-Chorus` label.

### Notes

- **Metadata is not lost from the product** — title, key, tempo, tags, artist and language live in `songs` columns and are edited in form fields. The loss is to the ChordPro *file*, which stops being self-describing.
- **Downloaded `.pro` files carry no metadata at all.** `SongViewPage.handleDownloadChordPro()` writes `chordpro_content` verbatim plus an optional `#` disclaimer block. No `{title}`, no `{key}`. Re-importing one into any other ChordPro tool yields an untitled, keyless song. The file extension is `.pro`; songs are stored under `.chordpro` filenames.
- **The disclaimer block is fragile** — appended as `#` lines at download time; re-importing and saving strips it.
- **Round-tripping is otherwise faithful** for the supported subset: sections, labels, chord offsets, comments and instrumentals survive intact. Legacy plain-header files are upgraded to directive form (intended migration).
- **Serialisation always emits long-form directives** (`{start_of_verse: …}`), never short forms, regardless of input style.
- `convertToCanonicalChordPro()` (`chordpro/convert.ts`) is the *other* canonicaliser, with `includeMeta: true`. It has **no production callers** (§10).

---

## 7. Render behaviour per surface

| Surface | Chord placement | Section label | Layout notes |
|---|---|---|---|
| **Web song page** (`SongViewPage`) | Canvas-measured, absolutely positioned to the exact character, over a `white-space:pre` line (`utils/songs/chordLineLayout.js`). Collisions nudged apart by one space width; wrapped rows re-measure. | `[Label]` **as authored**, bold, no uppercasing (`.section` CSS sets no `text-transform`) | Optional two-column CSS view. **Applies the header fallback** (§3.5). Renders line-less sections, so a stray blank `[Verse]` heading can appear. |
| **Worship Mode** | Same primitives (`components/song/ChordRender.jsx`) | `[Label]` as authored | CSS columns, auto-fit font size. **No** header fallback. |
| **Session viewer (web)** | Same primitives | `[Label]` as authored | Chord/lyric tier from the join code; instrumental rows hidden in lyric tier. **No** header fallback. |
| **PDF engine** (`utils/pdf_mvp/pure.js`) | jsPDF `getTextWidth`, character-exact, mono bold on a line above at `0.75 ×` line height; minimum one space between symbols | `[LABEL]` **upper-cased**, bold | Decision ladder: 1 col @ 16→12 pt → 2 col @ 16→12 pt → 1 col @ 15 pt multipage. Sections atomic. **Applies the header fallback.** **Ignores `{columns}` and `{column_break}` entirely** — the only column control is a `pdfColumns: 1` flag `SetlistPage.jsx:836` sets. Title 26 pt bold; `Key of X` 16 pt italic grey; comments italic grey `rgb(120,120,120)`; instrumentals mono bold. |
| **JPG engine** (`utils/media/image.js` + `jpgPlanner.js`) | Canvas-measured, character-exact, own collision resolver | `[LABEL]` upper-cased in the current path, `[label]` as-authored in the legacy path | **Single page only**; multi-page songs refused with an alert. The **only** engine reading `layoutHints` — and its caller drops them. **No** header fallback. |
| **iOS** (`apps/mobile/src/components/ChordChart.tsx`) | **WORD-ANCHORED.** Each chord attaches to the word its index falls inside; a mid-word chord snaps to the word start; two chords on one word are joined with a space above it. Flex row wrap. | Upper-cased, accent colour, **no brackets** | 1–3 column ceiling chosen by fit (`lib/columnLayout.ts`), never by the file. Filters line-less sections. **No** header fallback. |
| **macOS Studio** (`Viewer/ChordChartView.swift`) | Documented port of the iOS word-anchored algorithm, operating in UTF-16 units to match JS indices | Upper-cased, accent colour, no brackets | Two-column chart view. Filters line-less sections. Exports go through the web API, so an exported PDF uses character-exact placement while the screen uses word-anchored. |

The word-anchored model is a deliberate, documented choice for narrow screens. It is a genuinely
different reading of the same data: a chord placed mid-syllable (`a[D]gain`) shows over *again*
on iOS/Studio and over the *g* on web and in every export.

---

## 8. Cross-app discrepancies

| Behaviour | Web page | PDF | JPG | Worship | iOS | Studio | Effect |
|---|---|---|---|---|---|---|---|
| Bare `Pre-Chorus` / `Refrain` / `Ending` drawn as a heading | yes | yes | no | no | no | no | Same song shows a section on the web and a stray lyric line everywhere else. |
| Line-less sections filtered before render | no | no | no | no | yes | yes | A `{c:}` or `{inst}` mid-section leaves a trailing empty section (§3.4). iOS/Studio hide it; web draws a bare `[Verse]` heading. |
| Section label case | as-is | UPPER | UPPER | as-is | UPPER | UPPER | Cosmetic, but the web page can show both styles in one chart when the fallback fires. |
| Chord anchoring | exact | exact | exact | exact | **word** | **word** | Mid-word chords move to the word start on the native apps. |
| `{c: …}` comment text visible | yes | **browser only** | yes | yes | yes | yes | See below. |
| Key baseline when body and DB disagree | body | **DB** | **DB** | body | body | **DB** | Screen and export can differ by a whole key. |
| `{columns}` / `{column_break}` honoured | no | no | no* | no | no | no | *Implemented in the JPG planner; its caller drops `layoutHints`. **Nothing in the shipping product responds to these directives.** |
| `{capo}` surfaced | subtitle text | no | no | no | no | no | Both native apps have a capo calculator; neither reads the file's capo. |
| Instrumental rows split across two lines | 2-col only | 2-col only | 2-col only | 2-col only | **never** | 2-col only | iOS passes no `split` flag, so long instrumental runs can overflow the column. |

### 8.1 Comment text blank in server-rendered PDFs

`pure.js:286–293` draws `ln.plain` for a comment line. `sectionify()` (`pure.js:83`) maps
`plain: ln.plain ?? ln.lyrics ?? ''`, and the parser puts comment text in `ln.comment` while
leaving `lyrics` empty. Browser callers work around this by copying the text into `plain`
themselves — `SongViewPage.jsx:392`, `SetlistPage.jsx:869`, `SongbookPage.jsx:237`,
`BundlePage.jsx:52`. The two **server** paths do not:

- `apps/web/src/utils/pdf_mvp/serverSong.js` → used by `/api/export/song`, `/api/export/setlist`, `/api/export/songbook`
- `workers/telegram-bot/src/pdfRender.js` → its own duplicate of the same function

So `{c: Play softly}` exports as an empty italic line from the export API (which is what
Studio's Export and mobile's Export call) and from the Telegram bot.

### 8.2 Key precedence inversion

```js
// apps/mobile/app/viewer/[slug].tsx:136   (also PerformerScreen:151, SongViewPage:259)
const nativeKey = doc?.meta?.key || song?.default_key || songKey || ''

// apps/web/src/utils/pdf_mvp/serverSong.js:14  (and the worker duplicate)
const originalKey = song.default_key || parsed.meta?.key || ''
```

---

## 9. Import paths (three, no shared table)

| Path | Reached by | Vocabulary |
|---|---|---|
| **Paste into the editor body** | typing / paste | Full shared parser (§3). Comments, instrumentals and short forms all preserved. |
| **Editor "Import file" button** (`EditorPage.jsx:225–340`) | `.pro` / `.chordpro` upload | Its own scanner: `DIRECTIVE_RE = /^\{([^:}]+?)(?::\s*(.*?))?\s*\}$/`. Maps `title`, `artist\|composer\|author\|authors`, `key`, `tempo`, `time\|time_sig\|time_signature`, `youtube\|youtube_id`, `tag\|tags`, `country`, `lang\|language` into form fields. Keeps in the body **only** lines whose key starts with `start_of_` or `end_of_`. **Everything else brace-shaped is dropped before the body is stored** — including `{c:}` comments, `{instrumental}`, and every short form `{soc}`/`{eov}`/`{sob}`. Silently ignores `album`, `year`, `ccli`, `capo`, `subtitle`, `copyright`, `sorttitle`, `duration`, `lyricist`. |
| **Studio PDF import** (`packages/core/src/songs/pdfImport.ts`) | Studio only | Positioned PDF text → ChordPro. Widest heading vocabulary (§3.5); chord-line classifier using token ratio plus typographic signals (bold, relative font size); emits long-form directives via `SECTION_PRESETS`; validates its own output by round-tripping through `parseChordProOrLegacy` and falls back to an unwrapped body on failure. Emits structured warnings (`no_title`, `no_key`, `no_sections`, `no_chords`, `unpaired_chords`, `suspicious_placement`, `boundary_break`, `two_column`, `layout_untrusted`) plus a confidence score. |

**Consequence:** the same file imported by *button* loses its comments and short-form sections,
while the same file *pasted* into the textarea keeps them.

---

## 10. Orphaned, dead and duplicated code

| Item | Status | Detail |
|---|---|---|
| `chordpro/lexer.ts` → `lexChordPro` | UNUSED | Exported from the core barrel and shimmed into web. **Zero call sites anywhere, including tests.** Studio's highlighter cites it as documentation but does not run it. |
| `chordpro/convert.ts` → `convertToCanonicalChordPro`, `suggestCanonicalFilename` | UNUSED | Only `__tests__/convert.test.ts` imports it. Leftover from the file-based catalog era — produces a `.chordpro` filename for a system that no longer writes files. |
| `jpgPlanner.js:527` → `planSongLayout` | UNUSED | ~130 lines, exported, no callers. Sole home of `packIntoColumnsLegacy` and `scoreCandidate`. |
| `jpgPlanner.js:615` → `hasColumnsHint` | DEAD BRANCH | Reads `song.meta.columns` / `song.hints.columns`. `normalizeSongInput` writes neither (it writes `layoutHints.requestedColumns`). Always `false`. |
| `jpgPlanner.js:106` → `column_break` marker path | DEAD BRANCH | Expects `s.type === 'column_break'`; nothing produces such a section. |
| `parser` → `chordDefs`, `layoutHints` | WRITE-ONLY | Populated on every parse, mirrored into Studio's Swift `SongDoc`, read by no renderer on any platform. |
| `doc.meta.meta` | WRITE-ONLY | Every unrecognised directive accumulates here; only `serializeChordPro` reads it back, and the one production caller disables that with `includeMeta: false`. |
| `apps/web/scripts/convertChordProAll.mjs` (`npm run convert:short`) | BROKEN | Reads `apps/web/public/songs/`, which no longer exists (songs moved to Supabase). Fails immediately. |
| `apps/web/scripts/exportAllJpgs.mjs` | BROKEN | Same missing directory; also carries the copied parser (§1 row 7). |
| `chordpro/index.js` → `parseChordPro`, `extractChords`, `makeMonospaceChordLine` | NEAR-DEAD | Reachable only via `normalizeSongInput`'s string branch, which no shipping caller exercises. `makeMonospaceChordLine` has zero callers. **The transposition helpers in the same file are load-bearing everywhere** — do not delete the file. |
| `toRenderableSong` × 2 | DUPLICATE | `pdf_mvp/serverSong.js` and `workers/telegram-bot/src/pdfRender.js`, identical bodies, both carrying §8.1 and §8.2. `serverSong.js`'s own header comment acknowledges the duplication as a "follow-up". |
| `isSectionLabel` / `isHeaderLike` | DUPLICATE | Byte-identical regex in `SongViewPage.jsx:868` and `pdf_mvp/pure.js:256`. |
| Studio core bundle | UNGATED | `apps/studio/js/verify-bundle.mjs` is a thorough parity harness and runs nowhere in CI. `.github/workflows/pr-checks.yml` has a `token-drift` job for the generated Swift tokens but no equivalent for the core bundle; its other job runs lint/tests/build with `continue-on-error: true`. Bundle parser regexes match `parser.ts` at the time of this audit. |

---

## 11. Documentation drift

| Doc | Claim | Reality |
|---|---|---|
| `apps/web/src/components/editor/ChordProGuideDrawer.jsx:69` | "Available sections: verse, chorus, bridge, **pre_chorus**, intro, outro, tag, **interlude**" | The parser accepts neither `pre_chorus` nor `interlude`. `SECTION_PRESETS` already maps both to named choruses; the guide was not updated. |
| Same, :91–92 | "`{define}` and `{chord}` are not rendered" | Accurate in effect — `{define}` *is* parsed into `chordDefs`, but nothing draws it. |
| Same, :89 | "`{capo}`, `{tempo}`, `{key}`, `{title}` — use the metadata fields instead" | Accurate and load-bearing: those directives are destroyed on save (§6). |
| `apps/web/public/wiki/ChordPro-Guide.md:21` | Example uses `# Verse 1` as a section heading | `#` lines are discarded before anything else runs (§3.2 row 1). The heading disappears. |
| Same, :66 | "plain headers (`Verse`, `Verse 1`, `Chorus`, `Bridge`, `Tag`, `Intro`, **`Instrumental`**)" | `Instrumental` is not in `RX_PLAIN_HEADER`; a bare `Instrumental` line is a lyric. |
| Same, :6, :29–39 | `{tags:}`, `{authors:}`, `{country:}`, `{song_id:}`, `{lang:}`, `{youtube:}`, `{mp3:}`, `{pptx:}` as body metadata, with translation-group inheritance rules | These are DB columns now. The body directives are parsed into `meta.meta` and deleted on save. Only the *import-file* path maps some of them across. `useSongs.jsx:73` hardcodes `language: 'en'` with the comment "language will be added when multi-lingual support is wired". |

---

## 12. Suggested starting points for a spec comparison

1. **Nothing rejects or reports unknown input.** There is no "this directive was ignored" surface in any app, and the one linter that could say so is wired into no UI. Every gap in this document is silent.
2. **The gap between PARSED-ONLY and RENDERED is where the format's identity leaks.** `{capo}`, `{define}`, `{columns}` and `{column_break}` are parsed, typed, mirrored into Swift, and drawn by nothing.
3. **Three of the four content-loss cases share one root cause:** a bracket or brace pattern that fails its intended test and then *succeeds* against a broader one further down the dispatch chain — `[Verse 1]` → `RX_CHORD`; `{start_of_pre_chorus: X}` → `RX_META`; `{ start_of_verse: V }` → `RX_META`.
4. **The spec's environments that GraceChords has no analogue for** — tab, grid, ABC, LilyPond, SVG, textblock — all degrade the same way: delimiters dropped, content emitted as lyrics. A single "unknown environment → skip its content" rule would change all of them at once.
5. **Section-environment coverage is the narrowest surface in the format**: six kinds, long form only for three of them. The spec's `pre_chorus`, `part`, `interlude` and arbitrary named sections have no representation beyond a chorus label.

---

## Appendix A — full parser output for a specification-style file

Input:

```chordpro
{title: Sample Worship Song}
{subtitle: A Modern Hymn}
{artist: Some Artist}
{composer: Another Person}
{album: Live Worship}
{key: G}
{time: 4/4}
{tempo: 72}
{duration: 4:35}
{capo: 2}
{ccli: 7654321}
{copyright: 2020 Some Publishing}
{comment: Intro x2}
{c: Play softly}
{ci: italic comment}
{cb: boxed comment}
{define: G base-fret 1 frets 3 2 0 0 0 3}
{chord: Am}
{start_of_verse: Verse 1}
[G]Amazing [G/B]grace how [C]sweet the sound
That [D]saved a [Em]wretch like [C]me[D]
{end_of_verse}
{start_of_chorus}
[G]How sweet the [C]sound
{end_of_chorus}
{chorus}
{start_of_bridge: Bridge}
[Am]Bridge line here
{end_of_bridge}
{start_of_pre_chorus: Pre-Chorus}
[F]Pre chorus text
{end_of_pre_chorus}
{start_of_tab}
E|--0--2--3--|
{end_of_tab}
{start_of_grid}
| G . . . | C . . . |
{end_of_grid}
{soc}
Short chorus line
{eoc}
{new_song}
{textfont: Times}
{textsize: 12}
{colb}
{column_break}
{columns: 2}
{sot}
tab line
{eot}
{highlight: something}
{x_custom_thing: value}
```

Parsed (`meta` and section structure; chord offsets omitted for brevity):

```
meta.title = "Sample Worship Song"
meta.key   = "G"
meta.capo  = 2
meta.meta  = { subtitle, artist, composer, album, time, tempo, duration, ccli,
               copyright, ci, cb, chord, start_of_pre_chorus, textfont, textsize,
               highlight, x_custom_thing }
layoutHints = { requestedColumns: 2, columnBreakAfter: [7] }
chordDefs   = [ { name: "G", raw: "define: G base-fret 1 frets 3 2 0 0 0 3" } ]

sections:
  comment      ""             "Intro x2"
  comment      ""             "Play softly"
  verse        "Verse 1"      "Amazing grace how sweet the sound" / "That saved a wretch like me"
  chorus       "Chorus"       "How sweet the sound"
  bridge       "Bridge"       "Bridge line here"
  verse        "Verse"        "Pre chorus text" / "E|--0--2--3--|" / "| G . . . | C . . . |"
  chorus       "Chorus"       "Short chorus line"
  verse        "Verse"        "tab line" / ""
```

Serialised back (`serializeChordPro(doc)`, `includeMeta: true`):

```chordpro
{title: Sample Worship Song}
{key: G}
{capo: 2}
{define: G base-fret 1 frets 3 2 0 0 0 3}
{columns: 2}
{subtitle: A Modern Hymn}
{artist: Some Artist}
{composer: Another Person}
{album: Live Worship}
{time: 4/4}
{tempo: 72}
{duration: 4:35}
{ccli: 7654321}
{copyright: 2020 Some Publishing}
{ci: italic comment}
{cb: boxed comment}
{chord: Am}
{start_of_pre_chorus: Pre-Chorus}
{textfont: Times}
{textsize: 12}
{highlight: something}
{x_custom_thing: value}

{c: Intro x2}

{c: Play softly}

{start_of_verse: Verse 1}
[G]Amazing [G/B]grace how [C]sweet the sound
That [D]saved a [Em]wretch like [C]me[D]
{end_of_verse}

{start_of_chorus: Chorus}
[G]How sweet the [C]sound
{end_of_chorus}

{start_of_bridge: Bridge}
[Am]Bridge line here
{end_of_bridge}

{start_of_verse: Verse}
[F]Pre chorus text
E|--0--2--3--|
| G . . . | C . . . |
{end_of_verse}

{start_of_chorus: Chorus}
Short chorus line
{end_of_chorus}

{column_break}

{start_of_verse: Verse}
tab line

{end_of_verse}
```

Note the metadata block now contains `{start_of_pre_chorus: Pre-Chorus}` as a pseudo-directive.
With `includeMeta: false` — the setting every real save uses — everything above the first blank
line is gone.

## Appendix B — verified edge-case transcript

```
{start_of_verse Verse 1}   -> directive dropped; auto-opened verse labelled "Verse" (label lost)
{ start_of_verse: V }      -> meta.meta["start_of_verse"]="V"; content in auto-opened "Verse"
{start_of_verse : V}       -> same as above
{START_OF_VERSE: V}        -> works (case-insensitive)
{eov: V1}                  -> closes; label ignored
{t: My Song}               -> meta.meta["t"]; NOT title
{c}                        -> dropped (no value)
{comment}                  -> dropped (no value)
{ c : hi }                 -> comment text ": hi"   (colon leaks into value)
{capo: 2nd fret}           -> meta.capo = 2         (via RX_META + parseInt)
{capo: abc}                -> meta.capo = NaN       (re-serialises as "{capo: NaN}")
{capo: -2}                 -> meta.capo = -2
{columns: 3}               -> requestedColumns = 1
{columns: 1}               -> requestedColumns = 1
{col: 2}                   -> meta.meta["col"]="2"
{title:  Spaced  }         -> meta.title = "Spaced" (trimmed)
{key: }                    -> meta.key = ""
{meta: tempo 72}           -> meta.meta["tempo"]="72"
{x: {y}}                   -> dropped entirely (RX_META cannot span the inner brace)
{ instrumental : G, C }    -> chords [": G", "C"]   (colon leaks)
{i:}                       -> chords [":"]
{inst}                     -> chords []
"hello: world" (lyric)     -> stays a lyric (no braces)
{title: A}\n{title: B}     -> meta.title = "B"      (last wins)

mixed mode:
  {sov: Verse 1} / Line one / {eov} / "" / Chorus / [C]Hook / Bridge / [D]Line
  ->  verse "Verse 1" [ "Line one" ]
      verse "Verse"   [ "Chorus", "Hook line", "Bridge", "Bridge line" ]

bracket headers:
  [Verse 1]  ->  lyrics "", chords [ {sym:"Verse 1", index:0} ]
  [Chorus]   ->  lyrics "", chords [ {sym:"Chorus",  index:0} ]
```
