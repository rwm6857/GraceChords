# Studio ↔ `packages/core` JS bridge

GraceChords Studio is native macOS SwiftUI, but it reuses `packages/core`'s logic
instead of reimplementing it in Swift (where it would drift from the JS that web
and mobile depend on). Core is bundled into one flat file and run inside a
JavaScriptCore `JSContext`.

## Files

| File | Role |
|------|------|
| `entry.mjs` | Bridge entry. Imports core **subpaths** (never the barrel), validates arguments, exports the functions in the table below. |
| `build-core-bundle.mjs` | esbuild build → `GraceChords Studio/GraceChords Studio/Resources/GraceChordsCore.js` |
| `verify-bundle.mjs` | Parity harness: bundle vs. the core modules `apps/mobile` resolves. |

Exposed to Swift:

| JS | Swift | Core function |
|----|-------|---------------|
| `GraceChordsCore.transpose(sym, steps, preferFlat)` | `CoreBridge.transpose(_:steps:preferFlat:)` | `chordpro/index.js` → `transposeSymPrefer` |
| `GraceChordsCore.parseToJSON(text)` | `CoreBridge.parse(_:) -> SongDoc` | `chordpro/parser.ts` → `parseChordProOrLegacy` |
| `GraceChordsCore.renderToJSON(text, steps, preferFlat, style)` | `CoreBridge.render(_:steps:preferFlat:style:)` | composition of the above + `songs/instrumental.js` |
| `GraceChordsCore.stepsBetween(from, to)` | `CoreBridge.stepsBetween(from:to:)` | `chordpro/index.js` → `stepsBetween` |
| `GraceChordsCore.formatKey(key, style)` | `CoreBridge.formatKey(_:style:)` | `chordpro/solfege.js` → `formatKeyDisplay` |
| `GraceChordsCore.lintToJSON(text)` | `CoreBridge.lint(_:) -> [LintWarning]` | `chordpro/lint.ts` → `lintChordPro` |
| `GraceChordsCore.hasMinRole(role, min)` | `CoreBridge.hasMinRole(_:atLeast:)` | `rbac/roles.js` → `hasMinRole` |
| `GraceChordsCore.roleOrderJSON()` | *(parity harness only)* | `rbac/roles.js` → `ROLE_ORDER` |
| `GraceChordsCore.slugify(title)` | `CoreBridge.slugify(_:)` | `songs/slug.ts` → `slugify` |
| `GraceChordsCore.insertAtCursorJSON(value, start, end, text)` | `CoreBridge.insertAtCursor(in:start:end:text:)` | `chordpro/editing.ts` → `insertAtCursor` |
| `GraceChordsCore.wrapSectionJSON(value, start, end, directive, label)` | `CoreBridge.wrapSection(in:start:end:directive:label:)` | `chordpro/editing.ts` → `wrapSection` |
| `GraceChordsCore.sectionPresetsJSON()` | `CoreBridge.sectionPresets()` | `chordpro/editing.ts` → `SECTION_PRESETS` |
| `GraceChordsCore.diatonicChordsJSON(key)` | `CoreBridge.diatonicChords(for:)` | `chordpro/diatonicChords.js` → `getDiatonicChords` |
| `GraceChordsCore.chordVariantsJSON()` | `CoreBridge.chordVariants()` | `chordpro/editing.ts` → `CHORD_VARIANTS` |
| `GraceChordsCore.chordToken(symbol)` | `CoreBridge.chordToken(_:)` | `chordpro/editing.ts` → `chordInsertToken` |

The editing helpers take and return **UTF-16 offsets**, because that is what a JS
string index is. Swift's native `String.Index` arithmetic counts *Characters*, so the
two disagree the moment a lyric leaves ASCII — and the catalog has Turkish and Korean
songs. `Core/ChordProEditing.swift` does the conversion at the boundary and the parity
harness covers Turkish, Korean and an emoji surrogate pair specifically.

Adding `lint.ts` and `slug.ts` cost the bundle nothing transitively: `lint.ts`'s only
runtime import is `./parser`, which was already bundled, and `slug.ts` imports
nothing, and `editing.ts` / `diatonicChords.js` / `rbac/roles.js` likewise. The build
script prints its module list — **ten** files as of Phase 3 — so a dependency creeping
in is visible on every rebuild.

`hasMinRole` and `slugify` are bridged rather than ported for the same reason as the
parser: both have outputs that must match another client exactly. A Swift copy of
`ROLE_ORDER` is precisely the thing that outlives a hierarchy change unnoticed
(`collaborator` was removed from it in 2026-07), and a Swift slug regex that differed
from core's by one character class would mint URLs no other client produces.

`lintChordPro` returns **warnings only** — every code is prefixed `warn:` and there is
no severity field. Studio was its first consumer; before Phase 3 the function was
referenced by one web test and no UI.

`parseToJSON` returns the whole `SongDoc` as a JSON string so Swift decodes it in
one `JSONDecoder` step instead of walking a `JSValue` tree; the Swift mirrors of
`chordpro/types.ts` live in `Core/SongDoc.swift`.

Swift side: `GraceChords Studio/GraceChords Studio/Core/CoreBridge.swift`.

## Rebuilding the bundle

Run from the repo root, after any change to `entry.mjs` or to
`packages/core/src/chordpro/`:

```sh
node "apps/studio/js/build-core-bundle.mjs"
node "apps/studio/js/verify-bundle.mjs"     # must print ALL CHECKS PASSED
```

The output is committed, so a clean checkout builds in Xcode without running npm.

### Why this is a manual step, not an Xcode Run Script phase

1. Xcode build phases run with a minimal `PATH`; `node` installed via Homebrew or
   nvm is not on it, which fails as a confusing build error rather than an
   obvious missing-tool one.
2. The output is committed, so regenerating it on every build would dirty the
   working tree constantly.
3. Fewer moving parts while the spike is being diagnosed.

When this graduates past the spike, the switch is: gitignore
`Resources/GraceChordsCore.js`, add a Run Script phase with an absolute `node`
path (declaring `entry.mjs` + the core sources as Input Files and the bundle as
an Output File so Xcode can skip unchanged builds).

## Confirming the bundle reaches the built app

The Xcode target uses a file-system-synchronized root group (`objectVersion = 77`),
so `Resources/GraceChordsCore.js` is picked up from disk with no project-file
edits — but Xcode decides the build phase from the file type, and a `.js` file has
no compiler. Verify it landed:

```sh
ls -l "$(xcodebuild -project "apps/studio/GraceChords Studio/GraceChords Studio.xcodeproj" \
  -showBuildSettings 2>/dev/null | awk -F' = ' '/ BUILT_PRODUCTS_DIR/{print $2}' \
  )/GraceChords Studio.app/Contents/Resources/GraceChordsCore.js"
```

The app also reports this itself: the spike window prints the path the bundle was
loaded from, and `CoreBridge` throws `bundleMissing` with remediation text rather
than crashing if it is absent.

**If it did not land:** select `GraceChordsCore.js` in Xcode → File Inspector →
set Target Membership for "GraceChords Studio". If a synchronized group blocks
that, add a Copy Files phase (Destination: Resources, Subpath: empty) with the
file, or a Run Script phase after it:

```sh
cp "$SRCROOT/GraceChords Studio/Resources/GraceChordsCore.js" \
   "$BUILT_PRODUCTS_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/"
```

## Bundle format

`--bundle --format=iife --global-name=GraceChordsCore --platform=neutral
--target=safari17`, so `JSContext.evaluateScript` leaves a `GraceChordsCore`
object on the context's global. `JSContext` has no CommonJS/ESM loader, so an
IIFE that self-assigns is the format that needs no shim.

## Do not import the `@gracechords/core` barrel here

`packages/core/src/index.ts` re-exports `supabase/client.js`, which pulls in
`@supabase/supabase-js` and its `fetch`/WebSocket/storage expectations — none of
which exist in a bare `JSContext`. Always import the narrowest subpath
(`@gracechords/core/<dir>/<file>`, which the package's `"./*": "./src/*"` exports
pattern resolves). The current bundle is 10 modules / ~27 KB with no dependencies;
`build-core-bundle.mjs` prints the module list so unexpected growth is visible.

## How parity is checked

`verify-bundle.mjs` evaluates the built bundle in a bare `node:vm` context — no
module loader, `var` lands on the global, the closest analogue to
`JSContext.evaluateScript` — and compares results against the core modules
themselves:

- **transpose:** against `@gracechords/core/chordpro/index.js`, imported directly.
- **parse:** against `chordpro/parser.ts`. Node cannot import that file (its
  type-only import of `./types` is written as a value import, which Node's
  type-stripping keeps and then fails to link), so the reference side runs the same
  source through `esbuild.transform` — the same erasure Metro and Vite perform.
  Comparison is the full `SongDoc` as JSON, over 12 hand-written cases plus the six
  real fixtures in `apps/web/src/__tests__/fixtures/chordpro/` (read-only).
- **lint:** against `chordpro/lint.ts`. Same problem as the parser plus a real
  extensionless runtime import, so the reference goes through `esbuild.build`
  (bundling, not just transforming). Comparison is the full `LintWarning[]` as JSON
  over the parser corpus plus 12 cases written to trip each warning code, and every
  returned warning is checked for the exact key set `Core/LintWarning.swift` decodes
  — an added key would otherwise be silently dropped on the Swift side.
- **lint independence:** lint must return an array for every body the corpus
  contains, including ones the parser rejects. The editor shows warnings for exactly
  the bodies most worth reading them on, so lint must not fail alongside the parse.
- **hasMinRole:** the full role × minimum matrix against `rbac/roles.js`, including
  a role outside the hierarchy (`nonsense`) and the empty string, plus a hardcoded
  assertion that only editor/admin/owner clear the editor+ gate — so a hierarchy
  change that promoted `user` fails here rather than in the app. Keep both probes:
  the empty string is coerced to `user`, while an unknown role lands below every
  role and grants nothing, so they exercise different branches.
- **editing:** `insertAtCursor` and `wrapSection` against `chordpro/editing.ts`
  (transform only — it imports nothing). `wrapSection` is compared across **every**
  core `SECTION_PRESET` × five selection shapes, and each preset's output is then run
  through `parseToJSON` to assert it yields exactly one section. That last check is the
  one that matters: the parser only accepts verse|chorus|bridge|intro|tag|outro, so a
  preset emitting anything else would be silently dropped from the chart rather than
  erroring, and Pre-Chorus/Interlude are deliberately *named choruses* for that reason.
- **diatonicChords:** every key in core's `CHROMATIC_KEYS`, plus `Gb`, an unknown key
  and `''` (both → null). Every chord of every key is additionally tokenised and parsed
  back, so a button cannot insert a symbol the chart would fail to render.
- **slugify:** against `songs/slug.ts` over 16 titles including non-ASCII and
  punctuation-only, plus the contract Swift depends on — an unslugifiable title must
  return `''` so the caller refuses the insert rather than writing an empty `slug`.

## Adding another core function later

1. Export it from `entry.mjs` with argument validation at the boundary.
2. Add a typed Swift method to `CoreBridge` — no generic "evaluate this string"
   API, so every call site stays checkable.
3. Add cases to `verify-bundle.mjs` and re-run it.
