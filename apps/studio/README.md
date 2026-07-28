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

Phase 2 covers the live view controls (transpose bar, key picker, capo hint, view
options, two-column chart), favorites, server-rendered PDF/JPG export and Telegram
push, and the library's filter & sort, result counts and lettered sections.

Phase 3 adds the editor: a plain-text ChordPro editor with a live preview that
reuses the Viewer's own renderer, draft/published state on `public.songs`, hard
delete, and the bridged ChordPro linter. See [Editing songs](#editing-songs).

Not built yet: setlists, admin/content management beyond songs, GraceTracks,
offline caching, ChordPro syntax highlighting. Personal drafts (`personal_songs`,
which mobile merges into its library) are not included — Studio reads and writes
the public catalog only.

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
Editor/SongEditorModel.swift   debounced preview, lint, save / publish / delete
Editor/SongEditorView.swift    metadata form, monospaced ChordPro editor, split preview
Editor/LintWarningsView.swift  the advisory strip under the preview
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

**Lint is advisory and never blocks a save.** Every code
`packages/core/src/chordpro/lint.ts` emits is prefixed `warn:` and the module has no
severity field, so there is nothing to present as an error. A body the *parser*
rejects is a separate failure and appears in the preview pane, above the last
successfully rendered chart rather than replacing it — mid-edit a body is
transiently unparseable (a half-typed `{start_of_`), and blanking the pane on those
keystrokes would make the preview unusable.

**Syntax highlighting is not implemented.** SwiftUI's `TextEditor` cannot style
ranges, so it needs `NSViewRepresentable` over `NSTextView` with a custom
`NSTextStorage` — which brings attribute runs fighting the undo manager, IME
marked-text ranges, and re-highlight cost on a long song. That is a self-contained
piece of work orthogonal to whether saving and publishing are correct, so the editor
ships monospaced and unhighlighted. Clicking a lint warning to jump to its line
waits on the same change, and `LintWarning.lineIndex` is inconsistent besides
(section-relative for most codes, body-relative for `warn:section_mismatch`).

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
