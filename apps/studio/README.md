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

Three things are needed before the app will work, and two of them are Xcode
settings this repo cannot carry for you.

**1. Supabase credentials.** Same public-safe values `apps/mobile/.env` uses
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) — never the
service-role key. `Config/StudioConfig.swift` looks in this order:

1. Scheme environment variables `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   (Product ▸ Scheme ▸ Edit Scheme ▸ Run ▸ Arguments) — **recommended**, nothing
   lands in git.
2. `Info.plist` keys of the same names.
3. The fallback constants at the bottom of `StudioConfig.swift`.

Missing config shows a readable "Studio is not configured" screen, not a crash —
the same choice `apps/mobile/src/lib/supabase.ts` makes and for the same reason.

**2. Outgoing network connections.** The target has `ENABLE_APP_SANDBOX = YES` and
no network entitlement, so every Supabase request fails until you check
Signing & Capabilities ▸ App Sandbox ▸ **Outgoing Connections (Client)**.
Symptom if missed: sign-in hangs or reports a generic network error.

**3. `supabase-swift`.** Add it as a package dependency (File ▸ Add Package
Dependencies… → `https://github.com/supabase/supabase-swift`, product `Supabase`)
and **commit the resulting project changes** — the committed `project.pbxproj` has
no package references, so the Swift sources here will not compile without it.

If sign-in fails with a Keychain error (`errSecMissingEntitlement`, OSStatus
-34018), supabase-swift's default Keychain session store is being blocked by the
sandbox: add the Keychain Sharing capability, or inject a custom
`AuthLocalStorage` when constructing the client in `Services/AppServices.swift`.

## Architecture

```
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
