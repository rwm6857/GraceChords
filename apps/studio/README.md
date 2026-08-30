# GraceChords Studio (macOS)

Native SwiftUI companion app for song creation and content management. Built
native rather than Mac Catalyst specifically so it can reuse `packages/core`'s
logic — ChordPro parsing, transposition, RBAC — through JavaScriptCore instead of
reimplementing it in Swift, where it would drift from the JS that `apps/mobile` and
`apps/web` both depend on.

Not an npm workspace member (no `package.json`), so it does not affect the
monorepo's install graph. See [`js/README.md`](js/README.md) for the JS bridge and
[`SPIKE-RESULTS.md`](SPIKE-RESULTS.md) for the Phase 0 gate report.

## Current state

| Phase | Scope |
|-------|-------|
| 0 | `packages/core` transpose bundled into JavaScriptCore, called from Swift |
| 1 | Auth (email/password), Song Library with search, Song Viewer rendering parsed ChordPro |
| 2 | Design tokens generated into Swift; Viewer and Library brought to iOS/iPadOS parity |
| 3 | Song creation, editing, publishing and deletion in a role-gated Manage section |
| 4 | Syntax highlighting, draft recovery, the lint strip, a test target, and a signed release |

Phase 2 covers the live view controls (transpose bar, key picker, capo hint, view
options, two-column chart), favorites, server-rendered PDF/JPG export and Telegram
push, and the library's filter & sort, result counts and lettered sections.

Phase 3 adds the editor: a syntax-highlighted ChordPro editor with a live preview
that reuses the Viewer's own renderer, draft/published state on `public.songs`, hard
delete, draft recovery across a quit, and the bridged ChordPro linter surfaced as a
warnings strip. See [Editing songs](#editing-songs).

Phase 4 is the editor's remaining rough edges plus the means to ship it: ChordPro
[syntax highlighting](#editing-songs), unsaved work that survives a quit, warnings you
can click through to, a [test target](#tests), and a
[notarized DMG](#releasing) for direct download.

Not built yet: setlists, admin/content management beyond songs, GraceTracks,
offline caching. Personal drafts (`personal_songs`, which mobile merges into its
library) are not included — Studio reads and writes the public catalog only.

## First-run setup

Only one thing is left to you: the Supabase credentials. The package dependency
and the sandbox entitlement are both committed now.

**Supabase credentials.** Same public-safe values `apps/mobile/.env` uses
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) — never the
service-role key. `Config/StudioConfig.swift` looks in this order:

1. Scheme environment variables `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   (Product ▸ Scheme ▸ Edit Scheme ▸ Run ▸ Arguments) — **recommended**, nothing
   lands in git. The scheme lives under `xcuserdata/`, which
   [`apps/studio/.gitignore`](.gitignore) excludes for exactly this reason.
2. `Info.plist` keys of the same names.
3. The fallback constants at the bottom of `StudioConfig.swift`.

Missing config shows a readable "Studio is not configured" screen, not a crash —
the same choice `apps/mobile/src/lib/supabase.ts` makes and for the same reason.

**Export (optional).** `API_BASE_URL` points at the web app's Pages Functions,
which render PDF/JPG exports and relay Telegram pushes — the same value
`apps/mobile/.env` uses for `EXPO_PUBLIC_API_BASE_URL`, and it must be the
canonical origin rather than a redirecting one (an apex that redirects to `www`
turns the POST into a GET and the API answers 405). Resolved the same three ways,
and deliberately optional: without it Export is disabled and nothing else changes.

To run from a terminal instead of Xcode, pass the same two variables to the built
binary — `StudioConfig` reads the process environment either way:

```sh
SUPABASE_URL=… SUPABASE_ANON_KEY=… \
  "$(xcodebuild -project "apps/studio/GraceChords Studio/GraceChords Studio.xcodeproj" \
     -scheme "GraceChords Studio" -showBuildSettings 2>/dev/null \
     | awk '/ BUILT_PRODUCTS_DIR /{print $3}')/GraceChords Studio.app/Contents/MacOS/GraceChords Studio"
```

### Already handled in the committed project

- **`supabase-swift`** is a package dependency of the target
  (`XCRemoteSwiftPackageReference` → product `Supabase`), pinned by
  `project.xcworkspace/xcshareddata/swiftpm/Package.resolved`. Xcode resolves it
  on first open; `xcodebuild -resolvePackageDependencies` does it from the CLI.
- **Outgoing network connections.** `ENABLE_APP_SANDBOX = YES` alone makes every
  Supabase request fail to even resolve the host (`NSURLErrorDomain -1003`), so
  both target configurations set `ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES` —
  the build-setting form of Signing & Capabilities ▸ App Sandbox ▸ Outgoing
  Connections (Client), which Xcode turns into
  `com.apple.security.network.client` in the generated entitlements.
- **Session persistence needs no extra capability.** supabase-swift's default
  `KeychainLocalStorage` writes a generic-password item with no access group,
  which a sandboxed, team-signed build is allowed to do. If a future signing
  change breaks that, the symptom is `errSecMissingEntitlement` (OSStatus
  -34018) on sign-in; the fixes are the Keychain Sharing capability or a custom
  `AuthLocalStorage` injected in `Services/AppServices.swift`.

`ObservableObject` and `@Published` need an explicit `import Combine` here: the
target builds with `SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY = YES`, under
which they are not visible through a transitive import of SwiftUI or Supabase.

## Architecture

```
Design/DesignTokens.generated.swift  GENERATED palette/spacing/radii/layout/type ramp
Design/Theme.swift             how those resolve on macOS (dynamic colors, type scale)
Config/StudioConfig.swift      URL + anon key + API base resolution, config-error text
Config/StudioDefaults.swift    app-wide prefs (chord style, keep-awake, auto-hide)
Design/Theme.swift             SwiftUI layer over the generated tokens
Design/DesignTokens.generated.swift  generated from packages/tokens — do not edit
Services/AppServices.swift     one SupabaseClient, one SongsRepository, one CoreBridge
Auth/AuthController.swift      session phase + role, Keychain-persisted via supabase-swift
Auth/SignInView.swift          email + password only
Data/SongsRepository.swift     public.songs reads and writes, mirroring core's songsRepo.js
Data/SongWritePayload.swift    insert/update column set + editor_audit_log row
Data/UserRepository.swift      public.users.role, mirroring core's fetchUserRole
Data/StarsRepository.swift     user_starred_songs (favorites)
Data/SongModels.swift          row models (snake_case CodingKeys), SongStatus
Services/ExportService.swift   /api/export/song + /api/telegram/push
Library/LibraryViewModel.swift fetch-once, search, tag filter, sort, selection
Library/LibrarySort.swift      grouping/sorting, port of mobile's buildSections
Library/SongLibraryView.swift  search + filter + sectioned list (sidebar/single-pane)
Library/FilterSortView.swift   sort list + tag chips
Viewer/SongViewerModel.swift   fetch, transpose model, view options
Viewer/SongViewerView.swift    header, chart, toolbar popovers, transpose bar
Viewer/ChordChartView.swift    section/line rendering, port of mobile's ChordChart
Viewer/TwoColumnChartView.swift fill-first column partition, port of columnLayout.ts
Viewer/TransposeBar.swift      floating key-down / key / key-up pill + capo chip
Viewer/ViewOptionsView.swift   chords, sections, font size, style, accidentals, columns
Viewer/KeyPickerView.swift     4×3 key grid + ♯/♭ toggle
Viewer/ExportView.swift        PDF / JPG / share / Telegram
Viewer/StarButton.swift        favorite toggle (optimistic)
Viewer/ViewerPrefs.swift       per-song column mode
Viewer/KeepScreenAwake.swift   display-sleep assertion, scoped to the view
Viewer/FlowLayout.swift        wrapping row layout for chord-over-word cells
Manage/ManageSongsView.swift   editor+ section: drafts + published list, owns the editor
Editor/SongForm.swift          form state + validation, mirrors core's songAuthoring.ts
Editor/SongEditorModel.swift   debounced preview, save / publish / delete, outcomes
Editor/SongEditorView.swift    metadata form, monospaced ChordPro editor, split preview
Editor/TagField.swift           tag entry with a type-ahead over the catalog's tags
Manage/EditorSession.swift      what is open in the editor, shared with the shell
Navigation/ShellNavigation.swift  which section is showing, reachable from the View menu
Core/CoreBridge.swift          JSContext wrapper: transpose, parse, render, key helpers,
                               lint, hasMinRole, slugify
Core/LintWarning.swift         one finding from core's lint.ts (warnings only)
Core/ChordStyle.swift          ChordStyle, Accidental, Capo.fret
Core/SongDoc.swift             Swift mirrors of chordpro/types.ts
ContentView.swift              config gate → auth gate → split view
```

### Design tokens

Studio uses the **same tokens as `apps/mobile`** — the Signal-blue palette in
[`packages/tokens/native.ts`](../../packages/tokens/native.ts), not the web's
warm-brown `tokens.css`. Because Studio is a native target (and deliberately not
an npm workspace member) it cannot import the TypeScript map, so the values are
**generated into committed Swift** — an Xcode build never needs node:

```sh
npm run tokens:swift          # regenerate
npm run tokens:swift:check    # verify nothing has drifted (also a PR check)
```

`native.ts` stays the single source of truth. **Never hand-edit
`Design/DesignTokens.generated.swift` or the `AccentColor` colorset** — change
`native.ts`, regenerate, commit both. The generator needs Node ≥ 22.18 (it imports
the `.ts` file directly and relies on built-in type stripping).

What is generated: `GCColor`, `GCGradient`, `GCSpacing`, `GCRadius`, `GCLayout`,
the `GCTextSpec` ramp, and `Assets.xcassets/AccentColor.colorset` (so AppKit
chrome gets the brand accent too). `Design/Theme.swift` is hand-written and holds
no values — only the two macOS translations:

- **Colors resolve through AppKit**, not a SwiftUI `colorScheme` lookup, so each
  token also carries its Increase-Contrast variant (built from `native.ts`'s
  `*ContrastBoost` overlays). That reaches the same four combinations the mobile
  ThemeProvider does, and keeps working inside AppKit-backed surfaces where the
  SwiftUI environment does not.
- **The type ramp is scaled by `GCTypeScale.macOS` (0.82).** The shared ramp is
  iOS-tuned; macOS's system body is 13pt, and per `apps/mobile/AGENTS.md` the
  platform HIG wins over a pixel-for-pixel port. 0.82 was chosen because it lands
  `body` on exactly 13pt (largeTitle 27→22, rowTitle 16.5→13.5). Sizes are scaled,
  *relationships* stay shared.

Two deliberate exceptions:

- **`SongRow` keeps SwiftUI's semantic foreground styles** (`.primary` /
  `.secondary`) instead of `GCColor.ink` / `GCColor.sec`. The library `List` is
  selectable and macOS inverts a selected row's text to read against the accent
  fill — only automatic styles participate, so pinning token colors there would
  leave dark text on a Signal-blue selection. The row still takes its *sizes* from
  the ramp.
- **`ChordChartView`'s lyric/chord sizes are not scaled.** The chart is content,
  not chrome, and matches `apps/mobile`'s so the same song reads the same in both
  apps. Its colors do come from the tokens.

### Data access and RLS

Reading the catalog does **not** require a session: `public.songs` carries
`songs_select`, whose published branch has no role restriction
(`supabase/migrations/20260728000100_songs_status.sql`). The UI is still gated
behind sign-in, matching mobile, but that means a library that loads while auth is
broken indicates a config/network problem, not an auth one.

The policy is:

```sql
USING (is_deleted = false AND (status = 'published' OR public.has_min_role('editor')))
```

so anon and regular users get published songs, and editor+ additionally gets
drafts. **Studio never filters on `status` client-side.** An editor's library
legitimately contains drafts (badged `DRAFT`); everyone else's does not, because
the policy decided that, not the query. Duplicating the rule in the client is how
you end up with a filter that disagrees with the policy.

Writes are editor+ via `songs_insert` / `songs_update` / `songs_delete`. The UI
gate on the Manage section is a courtesy; the database is the enforcement, so a
non-editor who reached the editor would get a rejected write rather than a
successful one.

> **Two migrations underpin this, and the first is a security fix.** Before
> 2026-07-28 the live table had accumulated ten policies across three naming
> generations, including `songs_select USING (true)`. Permissive policies are OR'd,
> so that one overrode the others and made every row readable by anyone —
> soft-deleted rows included. `is_deleted = false` was being enforced only by each
> query's client-side `.eq()`. `20260728000000_songs_policy_consolidation.sql`
> replaces all ten with one per command; `20260728000100_songs_status.sql` then adds
> the column and the draft clause. Both have `.down.sql` counterparts.

### Editing songs

The **Manage** section appears only for editor+ (`packages/core`'s
`canDirectWrite`), checked through the bridged `hasMinRole` rather than a Swift copy
of the hierarchy. A role that cannot be read at all resolves to `user`, and a
bridge that failed to load resolves the gate to `false` — both fail closed.

It is a separate section rather than a mode on the Library/Viewer split for two
concrete reasons: `SongViewerView` installs `.focusedSceneObject(export)` and owns
the File ▸ Export menu plus its own toolbar, which an editor mode would contend
with; and the two surfaces own different state — the Library owns "which song is
selected for reading", the editor owns "does this song have unsaved changes".

**The preview is always reachable.** Above 680pt of *detail-column* width (the writing
pane's 360 plus the preview's 320) it sits beside the editor; below that the toolbar
toggle swaps the two panes instead, opening on the editor — you open an editor to type
in it. The first cut gated the split on 900pt measured on that same column which, with
the sidebar taking 240–300 of the window, meant the preview never appeared at an
ordinary window size. The threshold is now defined as the sum of the two panes'
minimum widths so it cannot drift above what they actually need.

**The metadata form is a four-column `Grid`**, so the proportions are declared
rather than eyeballed: Title and Artist take two columns each; Key takes two (with the
♯/♭ toggle that decides which spellings the picker offers, majors and minors in
labelled sections); Time and Tempo one each; Tags three and Language one. Grid keeps
the columns aligned down the whole form, which is what stops it reading as a pile of
differently-sized boxes. The form stops growing at 680pt — text fields stretched
across a wide window put a title's first and last characters a screen apart, which is
harder to read, not easier, so past that the space goes to the ChordPro body and the
preview instead. It carries no fixed height either: every attempt at one reserved
space the form did not use and left a dead band above the ChordPro divider.

Validation text is terse for the same reason — the label names the field and the
asterisk's colour says whether it blocks saving (red) or only publishing (amber), so
the message is just "Required", and what publishing still needs is summarised once in
the Details header rather than repeated under every field.

Tempo accepts digits only, filtered as you type: accepting "abc" and silently dropping
it at save loses input without saying so.

**Quick insert** sits above the ChordPro body: the seven diatonic chords for the
song's key (labelled with their numerals, so the bar teaches the key as well as saving
keystrokes), the eight section wrappers, a suffix picker (7 / maj7 / sus2 / sus4) that
applies to the next chord inserted, and the user's macros.

Every button's *effect* comes from `packages/core/src/chordpro/editing.ts` through the
bridge, so Studio inserts exactly what the web editor inserts — including core's rule
that Pre-Chorus and Interlude are emitted as **named choruses**, since the parser only
accepts verse|chorus|bridge|intro|tag|outro and would silently drop anything else. The
chord list is core's `getDiatonicChords`, so "the seven chords in this key" has one
definition rather than a Swift guess at music theory.

**Verse, Chorus and Bridge have key equivalents** — ⌃⌘V / ⌃⌘C / ⌃⌘B — in Edit, since
those three are most of the typing in a chart. The modifier is ⌃⌘ rather than plain ⌃
or ⌥ because both of those are already spoken for inside a text view: ⌃B and ⌃V are
`NSTextView`'s emacs bindings (`moveBackward` / `pageDown`), so binding them would
break cursor movement in the body, and ⌥C types `ç` — which Turkish lyrics need, and
the catalog has Turkish songs (⌥V and ⌥B are √ and ∫). ⇧⌘V is Paste and Match Style,
which leaves ⌃⌘ as the free, conventional space for app-specific verbs. The tooltips
name the shortcut, from the same lookup the commands use, so the two cannot drift.

Section buttons **wrap the selection** when there is one and insert an empty block with
the caret on its content line when there is not; the tooltip says which you will get,
because silently doing the other one is confusing. This needs the caret, which is why
the body is `TextEditor(text:selection:)` — and the offsets crossing the bridge are
UTF-16, not Character, counts (see `Core/ChordProEditing.swift`): a JS string index is
a UTF-16 offset, and the two disagree on any Turkish or Korean lyric.

Both rows use `FlowLayout` rather than `HStack`. Eight section buttons plus a menu do
not fit one row in a split pane, and an `HStack` answers that by truncating every label
to "Cho…" / "Brid…" / "Pre-…" — which for a button whose whole job is to be recognised
at a glance is the difference between useful and decorative.

**Macros** (`Editor/MacroStore.swift`) are user-defined snippets — a house intro, a tag
with a particular turnaround — saved to `UserDefaults`. Local and per-user on purpose:
these are personal shorthand rather than catalog content, and putting them in Supabase
would mean a schema, RLS and a sync story for something whose value is being instant
and private.

**Tags are a type-ahead over the catalog's own tags**, most-used first, matched on
prefix then substring, navigable with ↑/↓/Tab and taken with Return; commas split one
entry into several. The point is spelling discipline rather than convenience —
`songs.tags` is matched case-sensitively, so a tag typed slightly differently becomes a
second near-empty category, and the live data already shows the cost
("Contemporrary" beside "Contemporary", a tag that is just "."). Suggesting the
existing spelling makes reusing it easier than inventing a new one.

**The preview is the Viewer's renderer.** `SongEditorModel` calls the same
`CoreBridge.render` and hands the resulting `SongDoc` to the same `ChordChartView`.
There is deliberately no editor-specific rendering path, so the preview cannot
disagree with what a worshipper sees.

**Re-parse is debounced 300 ms** (`SongEditorModel.previewDebounce`), trailing and
restarted per keystroke, and skipped entirely when the debounced text matches what
was last parsed. A fast typist's inter-key gap is ~120–150 ms, so a burst of typing
collapses to one refresh at the end of it. The measured cost of a refresh —
`renderToJSON` + `lintToJSON` + `JSONDecoder` into `SongDoc` — is **~1.4 ms** on the
longest song in the live catalog (95 lines) and ~8 ms on one ten times that size, so
the bridge is not the constraint; SwiftUI's chart layout is the rest. If it ever
feels sluggish, lower that one constant rather than moving the work off the main
thread, which would mean a second `JSContext` and a second copy of the parser.

**Validation gates publishing, not saving.** Save needs only a title (`songs.title`
is NOT NULL and the slug derives from it); Publish enforces core's full
`validateSongForm` rule — title, key, ≥1 tag — so Studio and the web editor admit the
same songs to the public catalog. The split exists because the live catalog does not
satisfy its own create-time rule: **8 published songs have no tags and 5 have no key**,
and gating Save on the full rule made all of them uneditable — an editor opening one
to fix a typo would have had to invent a tag before Save would enable. A draft is
allowed to be incomplete too; that is most of what makes it a draft. The Details
header shows an amber "Missing details" rather than a red error, and Publish reports
what is missing instead of being silently disabled.

**Two lint codes are suppressed when the columns supply the value.**
`warn:missing_title` and `warn:missing_key` are dropped while `title` /
`default_key` are set (`SongEditorModel.applicable`). `lintChordPro` assumes a
standalone `.chordpro` file where `{title}` and `{key}` in the body are the only place
that metadata lives; here it lives in columns, and core's `canonicalizeForm` is
explicit that it will not inject it into the body. Every one of the 206 songs in the
catalog therefore tripped both — a panel that is wrong twice about every song is a
panel nobody reads, and it buried the codes that matter
(`warn:section_mismatch`, `warn:unknown_chord`). Filtered at the Studio boundary, not
in core: the module is correct for the input it documents, `apps/web` has a test
asserting exactly that output, and a row whose column *is* empty still gets the
warning.

**Typed tags snap to the catalog's spelling.** `songs.tags` is matched
case-sensitively by the library filter and the web app's tag pages, and the live data
is Title Case (`Slow`, `Praise`, `Worship`), so typing "worship" must not mint a
second tag beside "Worship". `SongForm.addTag` reuses an existing tag when one matches
case-insensitively and otherwise keeps what was typed; the ⋯ button beside the field
lists the catalog's tags to pick from.

**Saving never changes publication state.** `SongWritePayload` omits `status` on an
update, so editing a published song and saving keeps it live — silently
un-publishing on save would pull a song out of every worshipper's library because
someone fixed a typo, and this design has no review step to put it back. Publication
moves only via the explicit Publish / Unpublish actions.

**The toolbar is icons with a transient outcome badge**, not words plus a status
chip. Save (`square.and.arrow.down`, ⌘S) and Publish (`icloud.and.arrow.up`) each
report how they went on themselves — a green check or a red cross in the corner,
cleared by the next edit — so the verdict appears on the control that was pressed and
no permanent chrome has to carry it. Delete is a `trash` button with its confirmation.
Preview toggles with ⌘P. There is deliberately no separate "Save Draft": Save means
save, and whether the row is a draft or live is the row's business, not the button's.

**Leaving a dirty editor always asks.** The back button is gone; every way out —
picking another song, starting a new one, or switching to Library — routes through one
guard that offers Save / Discard / Cancel. That is why the open editor lives in
`EditorSession` (Manage/EditorSession.swift) rather than in `ManageSongsView`'s private
state: the shell has to be able to ask "would leaving now lose work?" before it
switches sections, and with the model private to the Manage view it could not, so
switching to Library discarded unsaved edits silently.

**Unsaved work also survives quitting** (`Editor/DraftStore.swift`). The guard was
only ever the reliable half — it catches every way *out of the editor* and nothing
about a crash, a force quit or a flat battery. A draft is written to Application
Support 1.5s after typing stops (longer than the preview's 300ms because nothing is
watching the result: the preview has to keep up with the eye, a draft only has to beat
a crash), flushed synchronously on `willTerminate`, and read back when that song is
opened again. It is keyed on `EditorSession.Target.id`, so a song's id or the literal
`new` — which means there is one recoverable new-song draft at a time, and it comes
back the next time you choose New Song rather than announcing itself at launch.

Three rules make it safe rather than merely convenient. **It restores into `form`,
never `savedForm`**, so recovered text is unsaved work that still has to be saved
deliberately and `isDirty` stays honest — there is deliberately no auto-save *to
Supabase*, because Studio has no review step and a background write that publishes a
half-typed lyric to every worshipper's library is the one failure this must not have.
**A draft that cannot be decoded is deleted, not repaired**, and so is one from a
newer build: losing recovered work is a bad day, and silently inventing content in a
song somebody is about to publish is worse. **A draft matching what was loaded is
deleted silently** rather than announced, because a banner about nothing teaches people
to dismiss banners. Discarding in the unsaved-changes guard clears the file too — the
alternative is the text you just discarded waiting for you the next time you open the
song.

**A new song writes no row until the first save.** `songs.slug` is `UNIQUE NOT NULL`
and core's `slugify` returns `''` for a title with no alphanumerics, so a row cannot
exist before there is a title — and creating one on "New Song" would leave an empty
row behind every abandoned attempt. The slug is derived once, on insert, and is
**never** re-derived when the title changes: it is the song's public URL, and
re-slugging would break every existing link to it (core's `upsertSong` makes the
same choice).

**Delete is a hard delete** — a real `DELETE`, not the `is_deleted = true` soft
delete `apps/web` and `apps/mobile` perform. It therefore cascades:
`setlist_songs.song_id` and `user_starred_songs.song_id` are both
`ON DELETE CASCADE`, so the song leaves every personal and team setlist and every
favourites list with it. The confirmation dialog names those consequences. An
`editor_audit_log` row is written **before** the delete, because
`editor_audit_log.song_id` is `ON DELETE SET NULL` — the row survives the cascade
carrying `song_slug` and `song_title` text, and is the only remaining trace.

**The lint strip is back** (`Editor/LintStrip.swift`), with the two changes that
answer why it was removed. It is **not there at all when there is nothing to say** —
`SongEditorModel.applicable` drops the two form-answered codes and a clean song renders
no strip rather than an empty one — and it is **collapsed by default**, one summary row
naming the count, because every code core emits is prefixed `warn:` and none of them
block saving, so they get the space an advisory deserves.

**Clicking a warning goes to its line, when its line can be known.**
`LintWarning.lineIndex` carries two different units and the code now says so rather
than flattening them: for `warn:long_line` and `warn:unknown_chord` it indexes a
*section's lyric lines* after comment lines are filtered out; for
`warn:section_mismatch` it indexes the *raw body's lines*, from a separate text scan
in `lint.ts` that never touches the parsed document. `LintWarning.Location` sorts them
into cases, and `Editor/LintLocator.swift` resolves a caret position from them —
exactly for a body line, and for a section-scoped warning by finding that section's
opening line, gated on its own count of section openers matching the parsed
document's. If the two disagree the jump is refused and the row is not a button: a
jump that lands two lines off is worse than no jump, because the writer edits what
they landed on. Pinning a *lyric line inside* a section is deliberately not attempted
— that would mean reimplementing the parser's line model in Swift, which is the drift
the bridge exists to prevent. If it ever matters, the fix is core emitting a
body-relative line, not a cleverer scan here.

A body the *parser* rejects is a different failure and still appears in the preview
pane, above the last successfully rendered chart rather than replacing it — mid-edit a
body is transiently unparseable (a half-typed `{start_of_`), and blanking the pane on
those keystrokes would make the preview unusable.

**Syntax highlighting.** `TextEditor` cannot style ranges, so the body is
`Editor/ChordProTextView.swift` — an `NSTextView` behind an `NSViewRepresentable`,
highlighted from its `NSTextStorage` delegate. Three colours:
**blue is a chord, purple is structure** (directives and bare `Verse 2` headings),
**grey is something the parser ignores** (`#` lines, and the brackets around a chord),
and everything left in the body colour is a word a worshipper will sing. A rainbow
would compete with the lyrics, which are what the writer is actually reading.

The patterns live in `Editor/ChordProHighlighter.swift`, transcribed from
`packages/core/src/chordpro/parser.ts` and naming the constant each one mirrors.
**This is the one place Studio reads ChordPro without the bridge**, on purpose:
what a chord *means* is a judgement and stays in core, but which characters to paint
is the same lexical shape core's own regexes describe, and routing it over
JavaScriptCore would mean a round trip per keystroke for something that cannot affect
what gets saved. Highlighting is allowed to be wrong where the parser is not — the
cost is a mis-coloured bracket. What it must not do is *disagree*: a chord the parser
reads but the editor leaves grey gets retyped by a writer who thinks it did not take.
If those regexes change, change these.

It is **line-oriented because ChordPro is** — no construct spans a newline, so
re-colouring the lines an edit touched is not an approximation, it is the whole of the
work. Measured: **0.3 ms** for the one-line pass typing pays, and 1.5 ms for a full
pass on a 97-line song (100 ms on a 1000-line body, which only a paste would reach).
The three hazards the earlier note here predicted were each real and each answered:

- **The undo manager.** Highlighting only ever sets attributes, never characters, so
  it cannot enter the undo stack. The quick-insert toolbar was the harder half —
  core hands back a whole new body, and assigning that wholesale would flatten every
  undo step behind it. `minimalReplacement` reduces it to the contiguous edit it
  actually was and applies it through `shouldChangeText(in:replacementString:)`, which
  is what registers the undo. Inserting `[G]` costs one ⌘Z and the typing survives.
  Undo history is also dropped when a different song is opened
  (`SongEditorModel.instanceID`), so ⌘Z cannot paste one song into another.
- **IME marked text.** Re-colouring underneath a composition fights the input method,
  so `hasMarkedText()` suspends the pass; the commit is itself a character edit and
  colours the line a keystroke later. Note that AppKit substitutes a Hangul-capable
  face for the monospaced one on Korean lyrics — correct, and the same thing
  `TextEditor` did.
- **Cost on a long song.** Answered by the line scoping above.

The move also *removed* code. The caret is now an `NSRange`, whose offsets are UTF-16
code units — exactly what a JS string index means — so the `TextSelection` →
`String.Index` → UTF-16 conversion that used to live in `Core/ChordProEditing.swift`
is gone rather than reimplemented.

Clicking a lint warning to jump to its line is now unblocked, but still needs
`LintWarning.lineIndex` fixed first: it is inconsistent (section-relative for most
codes, body-relative for `warn:section_mismatch`).

### Importing a PDF

Drop a text-based chord sheet on the editor's import sheet (⇧⌘I, the toolbar's
`document.badge.arrow.down`, or File ▸ Import from PDF) and its title, key, artist,
sections, lyrics and inline chords land in the form as unsaved work.

The split is: **extraction is native, every judgement is core's.**
`Import/PDFTextExtractor.swift` produces positioned text — words with rects, lines
with fonts, per-page column assignments — and hands it over the bridge as JSON to
`packages/core/src/songs/pdfImport.ts`, which decides what is a chord line, where a
section starts and which syllable a chord belongs to. Those heuristics are pure
string and geometry math with no platform in them, and the web editor could feed the
same function from pdf.js later; they are covered by
`apps/web/src/__tests__/pdfImport*.test.js`, whose fixtures are chord sheets written
as ASCII art and converted to geometry. (Studio now has a test target too — see
[Tests](#tests) — but the heuristics stay in core, where both clients get them.)

**`PDFPage.characterBounds(at:)` is deliberately not the geometry source.** It has
regressed twice — [FB14843671](https://developer.apple.com/forums/thread/762788) is
still open, and [FB12951475](https://developer.apple.com/forums/thread/735598) hit
`characterIndex(at:)` in shipping iOS 17 with "accuracy worsening further down the
page" — and it fails *silently*, returning plausible rects from the wrong row, which
for a chord sheet means chords landing confidently in the wrong place. Line and word
geometry come from `PDFSelection` instead. Per-character bounds is used only to
resolve a mid-word chord split inside a word already located, is measured only for
words long enough to be eligible, and every rect is checked against its enclosing
word before it is trusted — so a bad measurement costs precision, never correctness.

**The bias everywhere is refuse-and-warn over guess.** A chord line may only pair
with lyrics in the same column whose x-range overlaps it by half; failing that it
stays on its own line, spacing intact, with a warning. A block opening a column or a
page continues the section it was torn from rather than starting a new one, which
keeps a straddling verse in one piece at the cost of a genuine break that lands
exactly on the boundary — named in a warning, not silent. A page whose columns cannot
be read has pairing switched off wholesale. A chord line standing above its lyrics is
obvious and one keystroke to fix; a chord silently stamped on the wrong line is
neither.

There is **no review step** — the result goes into the editor, which is where it
would be edited anyway. What the importer was unsure about appears in the editor's
status banner, and below a confidence threshold the banner offers **Copy
Diagnostics**: the complete extraction JSON, which
`node "apps/studio/js/pdf-draft.mjs" <file>.json` replays through the heuristics
without Xcode. That is the loop for tuning against a chart that came out wrong.

**Fragments are the thing real charts do that nothing else prepares you for.** A
PraiseCharts or OnSong PDF does not store a lyric line as one text run — it emits a
separate positioned run under each chord, and `selectionsByLine()` hands each of those
back as its own "line" (43 of 77 lines on one chart, 78 of 129 on another). So words
are collected page-wide and regrouped into visual lines by baseline here, not taken
from PDFKit's line model. Before that, no chord line had a lyric line beneath it to
pair with and every chart imported with 45–80 unpaired chord lines.

Because a full-width credits or footer line fills the gutter in any horizontal
measurement, **columns are found by clustering where body lines start** rather than by
looking for a gap in an x-projection profile. A line is cut in two only when it has no
word in the gutter itself; a wide line that merely reaches across it stays whole. Gap
*width* alone is not sufficient, and getting that wrong cut one chart's title in half.

Five rules were tried, disproved against real PDFs, and are documented at their sites
so they are not re-added:

- a median-based stanza-gap threshold — chord-sheet pitches form two clusters, so the
  median lands in the valley between them;
- dropping lines repeated across pages — a chart whose every line sits under an `A`
  loses one chord per section, silently, since the lyrics survive;
- splitting a section at every vertical gap — real charts space stanzas generously, so
  this turned one eight-line verse into three sections with invented labels. Once a
  heading has been seen, only a heading starts a section;
- letting this file decide what is a header or footer — on a real chart the key and
  tempo share a line with the publisher's URL, so dropping it as furniture threw the
  song's key away before core could read it. Core strips furniture from the body; this
  file only keeps it out of the column evidence, and removes nothing but text far
  smaller than the body (fingering diagrams);
- requiring a gutter to run most of the way down the page — a right column often holds
  one short section and occupies only the top third.

### Search

Client-side over the already-loaded list, ranked exactly as
`apps/mobile/src/lib/songSearch.ts` does: title matches rank above tag-only
matches, ties broken by title, **artist deliberately not searched**.

### Narrow-window collapse

macOS does not collapse a `NavigationSplitView` the way iPadOS does, and
`NavigationSplitViewVisibility` has no "sidebar only" case — `.all` in a narrow
window simply squeezes both columns. Below **720pt** the sidebar is therefore
hidden (`.detailOnly`) and the detail column renders either the library or the
viewer, with a manual back button in the viewer's toolbar. It stays one view
hierarchy at both sizes, so crossing the threshold never resets search text,
selection, or scroll position (all held in `LibraryViewModel`).

### The NSTableView reentrancy warning at launch

Every launch logs one line:

```
WARNING: Application performed a reentrant operation in its NSTableView delegate.
This warning will become an assert in the future.
```

**It is cosmetic, it predates the editor, and it is not worth chasing.** Recorded
here so nobody re-runs the investigation.

It was bisected by controlled experiment — each candidate removed in isolation, the
app relaunched, and the warning counted. Ruled out individually:

| Removed | Warning |
|---|---|
| `SongLibraryView`'s `onGeometryChange` width mutation | still there |
| `applyLayout`'s split-visibility mutation (zero-width guard) | still there |
| `List(selection:)` binding | still there |
| `Section` + header wrapper | still there |
| `SongRow` (replaced with plain `Text`) | still there |
| **206 rows → ~26 rows, structure byte-identical** | **gone** |

So the trigger is **row count**, not anything our code does wrong: it is SwiftUI's
`List`/`NSTableView` bridging materialising a large sectioned list into a sidebar in
one pass. The only fix available to us would be to stop handing SwiftUI the whole
catalog at once — paging or chunking the sidebar — which would put macOS selection,
keyboard navigation, the A–Z index and search at risk to silence a log line. Not a
trade worth making.

Two things that investigation also settled, worth not re-deriving:

- `applyLayout` receives exactly one width at launch (**1257**, never 0), so a
  `width > 0` guard against a zero first pass is dead code. A `GeometryReader` here
  does not report 0 before its first real layout.
- "Will become an assert in the future" is AppKit's standard deprecation phrasing. If
  a future macOS does make it fatal it will affect a great many SwiftUI apps at once,
  and the remedy will be whatever Apple's guidance is then — not a bespoke
  restructuring now.

## Tests

```sh
xcodebuild -project "apps/studio/GraceChords Studio/GraceChords Studio.xcodeproj" \
  -scheme "GraceChords StudioTests" -destination 'platform=macOS' test
```

A Swift Testing bundle hosted by the app, in `GraceChords StudioTests/`. The scheme is
**shared and separately named** on purpose: the run scheme lives under `xcuserdata/`
because it holds the Supabase environment variables, and a shared scheme of the same
name would shadow it and take those away.

What is covered is what can be wrong *silently*. `ChordProHighlighter` is the one place
Studio reads ChordPro without the bridge, so its patterns are pinned against the
parser's — including that a `[G]` inside a `#` comment is not a chord, and that
re-highlighting one line matches a full pass. `ChordProTextView.minimalReplacement` is
what makes a toolbar insert one undo step, so it is checked against emoji and Korean
boundaries where a naive prefix/suffix diff would split a surrogate pair.
`DraftStore` is checked for the refusals — corrupt file, newer version, a key that
tries to walk out of the directory — because "restore nothing" is a fine answer and
"restore half a form" is not. `LintLocator` is checked for the case it must get right:
refusing when its section count disagrees with the parser's.

What is *not* covered is anything needing Supabase, since the tests run without
credentials, and the IME marked-text path, which needs a key window an automated run
does not get.

## Releasing

Studio ships as a **notarized DMG for direct download** — not the Mac App Store — so
`scripts/release.sh` is the whole of "will this open on somebody else's Mac".

```sh
./apps/studio/scripts/release.sh --check          # preflight only, changes nothing
SUPABASE_URL=… SUPABASE_ANON_KEY=… API_BASE_URL=… \
  ./apps/studio/scripts/release.sh --version 1.1.0 --build 4
```

It archives, exports with a Developer ID signature, embeds the configuration,
notarizes, staples, packages a DMG, notarizes and staples *that*, and finishes by
running the check a downloader's Mac will run (`spctl --assess`). Two one-time
prerequisites, neither of which the script can create for you:

- A **Developer ID Application** certificate. An *Apple Development* certificate is not
  it — that one only works on machines already in your provisioning profile, which is
  every Mac you are not shipping to. `--check` says which you have.
- A **notarytool keychain profile** (`xcrun notarytool store-credentials
  gracechords-studio --apple-id … --team-id J7Y8NYZ48Q --password <app-specific>`),
  which is what keeps the app-specific password out of the repo.

Two details worth knowing before editing that script:

**The Supabase credentials are written into `Info.plist` after the export and the app
is re-signed**, rather than passed as build settings. `INFOPLIST_KEY_<name>` only maps
the keys Xcode already knows; a custom name is accepted on the command line and
silently dropped, which yields a signed, notarized, published build that shows "Studio
is not configured" to everyone who downloads it. The re-sign passes the exported app's
own entitlements back explicitly, because `codesign --force` without them drops the
lot and an app that has lost `com.apple.security.network.client` cannot reach Supabase
at all. Both facts are asserted in the script rather than trusted.

**The app and the DMG are notarized separately.** Stapling only the DMG leaves an app
copied out of it relying on Gatekeeper reaching Apple online; stapling both means it
opens either way.

**Unused entitlements, worth tidying before a first public release.** The target still
carries the Xcode template's `com.apple.security.device.audio-input`,
`.device.bluetooth`, `.device.usb` and `.network.server`. Studio uses none of them —
it makes outgoing requests and opens files the user picked. They do not block
notarization, so this is not urgent, but they are four capabilities in the signature
that the app cannot justify. `ENABLE_USER_SELECTED_FILES` (the PDF import's open panel)
and `ENABLE_OUTGOING_NETWORK_CONNECTIONS` are the two it does need.
