# Studio ↔ `packages/core` JS bridge

GraceChords Studio is native macOS SwiftUI, but it reuses `packages/core`'s logic
instead of reimplementing it in Swift (where it would drift from the JS that web
and mobile depend on). Core is bundled into one flat file and run inside a
JavaScriptCore `JSContext`.

## Files

| File | Role |
|------|------|
| `entry.mjs` | Bridge entry. Imports the `@gracechords/core/chordpro/index.js` **subpath**, validates arguments, re-exports `transpose`. |
| `build-core-bundle.mjs` | esbuild build → `GraceChords Studio/GraceChords Studio/Resources/GraceChordsCore.js` |
| `verify-bundle.mjs` | Parity harness: bundle vs. the module Metro resolves for `apps/mobile`. |

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
pattern resolves). The current bundle is 2 modules / ~3 KB with no dependencies;
`verify-bundle.mjs` prints the module list so unexpected growth is visible.

## Adding another core function later

1. Re-export it from `entry.mjs` with argument validation at the boundary.
2. Add a typed Swift method to `CoreBridge` — no generic "evaluate this string"
   API, so every call site stays checkable.
3. Add cases to `CASES` in `verify-bundle.mjs` **and** `transposeCases` in
   `CoreBridgeSpike.swift`.
