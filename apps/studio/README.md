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

Not built yet: setlists, admin/content management, song editing, GraceTracks,
transpose UI, offline caching. Personal drafts (`personal_songs`, which mobile
merges into its library) are not included — Studio shows the public catalog only.

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
Config/StudioConfig.swift      URL + anon key resolution, config-error text
Services/AppServices.swift     one SupabaseClient, one SongsRepository, one CoreBridge
Auth/AuthController.swift      session phase, Keychain-persisted via supabase-swift
Auth/SignInView.swift          email + password only
Data/SongsRepository.swift     public.songs queries mirroring core's songsRepo.js
Data/SongModels.swift          row models (snake_case CodingKeys)
Library/LibraryViewModel.swift fetch-once + in-memory search, owns selection
Library/SongLibraryView.swift  search field + list (sidebar and single-pane)
Viewer/SongViewerView.swift    fetch body → CoreBridge.parse → chart
Viewer/ChordChartView.swift    section/line rendering, port of mobile's ChordChart
Viewer/FlowLayout.swift        wrapping row layout for chord-over-word cells
Core/CoreBridge.swift          JSContext wrapper: transpose + parse
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
`"Songs are publicly readable"` — `for select using (is_deleted = false)` with no
role restriction (`supabase/migrations/20260305_songs_migration.sql`). The UI is
still gated behind sign-in, matching mobile, but that means a library that loads
while auth is broken indicates a config/network problem, not an auth one.

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
