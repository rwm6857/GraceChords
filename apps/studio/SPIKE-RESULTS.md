# Studio spike — `packages/core` in JavaScriptCore (gate report)

Goal: prove `packages/core` can be bundled to one flat JS file, executed in a
Swift `JSContext`, called from Swift, and return results matching `apps/mobile`.
Transpose only. Everything else (song UI, auth, GraceTracks, other core
functions) is out of scope.

## Verdict: JS side CONFIRMED, Swift side needs one Xcode run

The bundling and parity questions — the ones that could have killed the native
approach — are answered. The remaining checks are mechanical and require macOS.

## What is bundled, and what is deliberately not

`entry.mjs` imports the **subpath** `@gracechords/core/chordpro/index.js`, not the
`@gracechords/core` barrel. The barrel re-exports `supabase/client.js` →
`@supabase/supabase-js`, which expects `fetch`, WebSocket and a storage adapter;
none exist in a bare `JSContext`. Importing narrowly avoids the problem entirely
rather than polyfilling it.

Result: **2 modules, 3061 bytes, zero dependencies** —
`packages/core/src/chordpro/index.js` + `apps/studio/js/entry.mjs`.

Audit of the rest of core for engine assumptions (grep for Node built-ins,
`process`, `Buffer`, `require`, DOM globals, RN polyfills) found only two soft
spots, both already guarded and both outside the transpose path:
`setlists/setStore.js:7` (`typeof crypto !== 'undefined'`, has a fallback) and
`bible/translationMenu.ts:88` (`typeof Intl === 'undefined'` guard). Core's only
external dependency anywhere is `@supabase/supabase-js`. Nothing in the transpose
path needs a shim.

## Parity with apps/mobile — CONFIRMED

`verify-bundle.mjs` evaluates the built bundle as global-scope source in a bare
`node:vm` context (the closest analogue to `JSContext.evaluateScript`: no module
loader, `var` lands on the global) and compares every result against
`transposeSymPrefer` imported from the same file Metro resolves for mobile.

12/12 cases agree, including the accidental-preservation behavior that
distinguishes `transposeSymPrefer` (what `ChordChart.tsx:195` and `capo.ts:30`
actually call) from the legacy `transposeSym`:

| input | steps | preferFlat | result |
|---|---|---|---|
| `G` | +2 | false | `A` |
| `G` | 0 | false | `G` |
| `G` | −2 | false | `F` |
| `Bb` | +2 | false | `C` (stays flat) |
| `A#` | +1 | false | `B` |
| `C` | +1 | true | `Db` |
| `C` | +1 | false | `C#` |
| `Em` | +3 | false | `Gm` |
| `D/F#` | +2 | false | `E/G#` (slash chord, both sides) |
| `Ebmaj7` | +5 | false | `Abmaj7` |
| `H7` | +2 | false | `H7` (see below) |

All five invalid-argument cases throw `TypeError` from the bridge entry rather
than returning garbage.

## One core behavior worth knowing before building on this

`transposeSymPrefer` **does not throw on a malformed chord** — it returns the
input unchanged (`H7` → `H7`). That is core's real behavior and therefore
mobile's, so the spike preserves it instead of "fixing" it at the bridge. The
bridge validates *argument types* (empty/non-string symbol, non-integer steps,
non-boolean flag) and throws there; that is the error path `CoreBridge` surfaces
as a Swift `CoreBridgeError.jsException`.

Consequence for Studio's future editor UI: chord validity must be checked
explicitly (`packages/core`'s lint module), not inferred from transpose throwing.

## Swift bridge shape

`Core/CoreBridge.swift` — loads `Resources/GraceChordsCore.js`, evaluates it,
grabs `GraceChordsCore.transpose`, and exposes exactly one typed method:

```swift
try bridge.transpose("G", steps: 2, preferFlat: false)   // "A"
```

No generic "evaluate this string" API. Every failure is a typed
`CoreBridgeError` (`bundleMissing`, `bundleUnreadable`, `evaluationFailed`,
`missingExport`, `jsException`, `unexpectedResult`); JS exceptions are captured
via `JSContext.exceptionHandler` into a reference box and rethrown as Swift
errors. `JSContext` is not thread-safe — one bridge, one thread (Studio uses the
main thread).

Two details that would have been silent bugs: arguments are built as explicit
`JSValue`s (`JSValue(bool:in:)`), because letting Swift `Bool` bridge through
`NSNumber` risks arriving in JS as a number; and every JavaScriptCore return
value is widened to an Optional before unwrapping, since JSC's headers are
inconsistently nullability-annotated across SDKs.

## Checklist status

| Check | Status |
|---|---|
| Bundle is a single flat file JSCore can run | ✅ 3061 bytes, IIFE, `GraceChordsCore` global |
| Bundle loads in a bare context without throwing | ✅ verified in `node:vm` |
| `transpose("G", +2)` → `"A"`, matching mobile | ✅ 12/12 cases match the module Metro resolves |
| Invalid input handled gracefully, no crash | ✅ JS side; Swift maps it to `CoreBridgeError.jsException` |
| Builds and runs in Xcode | ⏳ **needs macOS** — this work was done in a Linux container (no `swift`/`xcodebuild`) |
| Bundle present in the built app's Resources | ⏳ **needs macOS** — command in `js/README.md`; the app prints the loaded path |

To close the last two: open the project, Run, and read the window — it prints one
line per case plus the path the bundle was loaded from. `js/README.md` has the
fallback if Xcode does not copy the `.js` into Resources automatically.

## If this graduates

1. Gitignore `Resources/GraceChordsCore.js` and move the build to a Run Script
   phase with an absolute `node` path (Input/Output Files declared so incremental
   builds skip it). It is committed and manual for now — reasoning in
   `js/README.md`.
2. `esbuild` is currently resolved from the hoisted root `node_modules` (a
   transitive Vite dependency, pinned at 0.27.7 in the lockfile). Declaring it
   properly means giving `apps/studio` a `package.json`, which the root
   `workspaces: ["apps/*"]` glob would make a workspace member — a deliberate
   decision, out of scope here.
3. Anything touching Supabase (auth, song library) cannot ride this bundle as-is;
   that needs either a real HTTP/WebSocket-capable host layer in Swift or the
   queries staying native. Worth deciding before the first data-backed feature.
