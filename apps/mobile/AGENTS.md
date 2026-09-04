# @gracechords/mobile — Agent Guidance

Mobile sub-doc. The repo-root [`AGENTS.md`](../../AGENTS.md) is the single source
of truth for monorepo-wide conventions (shared core, RBAC, Supabase, commit
style). This file covers only what is **specific to the Expo app**. Read the root
doc first.

## What this is

A native (Expo / React Native) client for GraceChords, built from the design
reference. The core worship-team flows all ship: a themed four-tab shell (Home ·
Songs · Setlists · Daily Word), a full **Song Viewer** (real chord chart —
transpose, key change, accidentals, view options, star, export/share), a
**Performer** setlist play-through, the **Setlist Builder** (autosave, key
overrides, sharing, whole-set PDF), the **Daily Word / Reader** (M'Cheyne plan,
translations, highlights), native **Google/Apple auth** with a sprite avatar
picker, and a grouped **Settings** screen — all behind an
**authenticated-only** route gate. Build new screens on the shared theme +
primitives below — don't add one-off styles or hardcoded colors where a
primitive/token fits.

Design source: `gc-ios-design-reference/` (repo root). Follow its
non-negotiables — HIG/UIKit over the mockups, **native design-system icons
only** (SF Symbols on iOS, Material Symbols on Android — never hand-drawn/SVG),
and translate the visual rather than porting the HTML/CSS.

## Android design authority (Material Design 3)

On Android, **Material Design 3 is the authority the same way HIG is on iOS**:
the mockups in `gc-ios-design-reference/` were drawn iOS-first, so wherever they
and MD3 disagree on Android, **MD3 wins** — don't port an iOS visual
pixel-for-pixel onto Android when Material has an established pattern for it.

- **Native Material components over hand-rolled equivalents.** Prefer the
  platform's own patterns — the NativeTabs Material 3 navigation bar, the native
  `formSheet`/bottom sheet — over bespoke re-implementations. This is already how
  the tab bar and option sheets behave; keep new surfaces on that path.
- **Material Symbols, not custom SVGs.** Android icons come from Material Symbols
  via `SymbolIcon`'s Android branch and the `SF→Material` map in `symbolMap.ts` —
  never hand-drawn/SVG glyphs. A new icon means adding its SF→Material mapping and
  re-running `scripts/build-symbol-fonts.py` (see the Icons bullet under Primitives).

This section adds Android-specific authority; it does **not** override settled
cross-platform rules. Phone layouts stay exactly as designed, and
`formSheet`-over-popovers still holds — MD3 governs Android's *native idiom*, not
those decisions.

## Stack

- **Expo SDK 55** (pinned — not 54, not 56). Bump deliberately with
  `npx expo install expo@<sdk> --fix`, never by hand.
- **Expo Router v7** (`expo-router@~55.0.16`) — file-based routing under `app/`.
- **TypeScript**, React 19.2 / React Native 0.83.
- **Continuous Native Generation (CNG).** `ios/` and `android/` are **gitignored
  and never committed** — regenerate them with `npx expo prebuild`. Treat
  `app.json` (+ config plugins) as the source of truth for native config.
- **UI/native deps:** `expo-symbols` (SF Symbols, iOS), `expo-font` (registers
  the bundled Material Symbols subset fonts for the Android icon path),
  `expo-linear-gradient` (the
  Home hero), `expo-splash-screen` (auth-gate hold), `expo-haptics`,
  `react-native-gesture-handler` + `react-native-reanimated` (swipe-to-delete,
  transpose gestures), `expo-file-system` / `expo-sharing` / `expo-clipboard`
  (export + share sheet), `@react-native-google-signin/google-signin` +
  `expo-apple-authentication` (native auth), `expo-network` (Wi-Fi-only gate for
  offline downloads), `@react-native-community/datetimepicker` (the platform's own
  time picker behind the Daily Word reminder — pinned **exactly** at the
  SDK-bundled version, `8.6.0`), `expo-image` (the **only** component allowed to
  render the sprite and mark assets — RN's own `Image` decodes WebP on Android
  only, see `assets/README.md`), `expo-build-properties` (`useFrameworks: static`
  for google-signin on iOS, plus R8 minify + resource shrinking on Android — see
  the Android release build section below), and `expo-dev-client` (dev launcher — see the
  device note under Commands). Add Expo deps with
  `npx expo install <pkg>`; if the Expo API is unreachable, pin the SDK-correct
  version from `node_modules/expo/bundledNativeModules.json` and `npm install`.

## Commands (run from `apps/mobile/`)

- `npx expo run:ios` — prebuild + build + launch on the iOS simulator (needs
  macOS + Xcode).
- `npx expo run:ios --device` — build + launch on a physical device. Because
  `expo-dev-client` is installed, this produces a **dev client** whose launcher
  auto-discovers the Metro server on the LAN. This is the supported path for
  device runs: a bare (no dev-client) debug build has no reliable way to learn
  the Mac's address on a physical device and boots with
  `No script URL provided … unsanitizedScriptURLString = (null)`. Keep the phone
  and Mac on the same Wi-Fi (no Guest SSID / VPN) so the launcher can reach
  `http://<mac-ip>:8081`.
- `npm run start` — Metro dev server.
- `npx expo run:android` — prebuild + build + launch on an attached Android
  device or emulator.
- `npm run export:ios` / `export:android` — `expo export --platform <os>`; a
  Metro-only bundle that works on any OS. Use it to verify resolution/transpile
  without a simulator. Run **both** after touching anything shared.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` — vitest (node env) over the RN-free logic in `src/lib`
  (auth flows, validation, sprite persistence). Native modules are injected
  deps, never `vi.mock`ed.
- `npm run release:ios` / `release:android` — bump the marketing version, then
  `eas build --profile production --auto-submit`. **This is the command that
  ships a release.** Android submission additionally needs a Google Play service
  account JSON at `apps/mobile/play-service-account.json` (gitignored; path set
  in `eas.json` → `submit.production.android`), and the **first** upload of a new
  app must be made by hand in the Play Console — `eas submit` cannot create the
  listing.
- `npm run build:ios` / `build:android` — production build with **no** version
  bump, for iterating within a train that is not yet released (TestFlight betas,
  Play internal testing).
- `npm run version:bump` — the bump alone. `--minor` / `--major` / `--dry-run`.

## Android release build (R8)

`app.json` → `expo-build-properties` → `android` turns on
`enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds`.
Google Play requires **≥25% DEX optimization/shrinking/obfuscation from
1 Feb 2027**, enforced once uncompressed DEX reaches 10MB, and the Expo
prebuild template defaults `minifyEnabled` to **false** — so without this block
the app scores 0% and loses Store visibility and publishing.

- **Do not add keep rules speculatively.** `expo`, `expo-modules-core`,
  `react-native-reanimated`, `react-native-worklets` and
  `react-native-audio-api` all declare `consumerProguardFiles`, so their rules
  are applied automatically; `expo-modules-core`'s ruleset already covers the
  Kotlin reflection that registers Expo modules. `@supabase/supabase-js` is
  plain JavaScript running in Hermes and contributes no DEX at all.
  `modules/differentiate-without-color` is `"platforms": ["apple"]` and never
  links on Android. Add a rule only when a **release** build actually breaks,
  and say in a comment what broke.
- The only rules set by default keep `SourceFile`/`LineNumberTable`, so a
  release crash can be retraced instead of guessed at.
- R8 breakage is runtime-only and invisible in debug. Smoke-test a production
  build across: both native sign-ins and email/password, the viewer + transpose,
  setlist autosave, PDF/PNG export and the share sheet, Telegram push, the Daily
  Word reader and an offline download, reminder notifications, tuner, metronome,
  pitch pipe, and deep links.
- Measure it on the real artifact before uploading:
  `npm run check:aab -- path/to/app.aab`. That reports uncompressed DEX size
  against the 10MB gate, the three R8 percentages Play reads out of
  `BUNDLE-METADATA/com.android.tools/r8.json`, **and** 16 KB page alignment (see
  below); it exits non-zero on a real failure.
- **Deobfuscation is automatic — do not upload a mapping by hand.** For an app
  bundle (which the production profile builds), AGP embeds the mapping at
  `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` and Play
  extracts it on upload; Play **rejects** a manual upload when one is already
  embedded. Only APK builds need a hand-uploaded `mapping.txt`. Note `r8.json`
  is a *different* file — the optimization metrics for the quality gate above,
  not a mapping. `-keepattributes SourceFile,LineNumberTable` (set in
  `app.json`) is what keeps line numbers in the retraced trace.
- **Native symbols are not automatic.** Nothing in the Expo template sets
  `debugSymbolLevel` and `expo-build-properties` exposes no option for it, so
  `plugins/withNativeDebugSymbols.js` sets `SYMBOL_TABLE` — without it Play warns
  "no debug symbols for native code" and Hermes/Reanimated/audio-api crashes
  symbolicate to raw addresses. Symbols ship only in the uploaded artifact; Play
  strips them from the user download.
- **16 KB page sizes** are required for updates from **1 Feb 2027**. Expo SDK 55
  / RN 0.83 / current AGP produce aligned output, and the one third-party native
  dependency worth doubting is already clear —
  `react-native-audio-api/android/build.gradle` sets `useLegacyPackaging = false`
  explicitly for this. Nothing to configure; `npm run check:aab` is the proof.
- **Baseline Profile:** `plugins/withBaselineProfile.js` ships
  `android-profile/baseline-prof.txt` into the native project on every prebuild.
  It is empty until recorded on a device — see `android-profile/README.md`, and
  record it **after** R8, since the rules name post-obfuscation symbols.
- **Toolchain caveat:** `plugins/withFoojayFix.js` sets
  `org.gradle.java.installations.auto-download=false`, so Gradle will not fetch
  a JDK — R8 runs on the toolchain Expo provisions. A future AGP bump that wants
  a newer JDK will fail there first.

## App versioning (two independent numbers)

`eas.json` sets `cli.appVersionSource: "remote"`, so the **build number**
(`CFBundleVersion` / `versionCode`) lives on EAS servers and `autoIncrement:
true` on the `production` profile increments it per build. It is never read
from `app.json` — do **not** re-add `ios.buildNumber` there; EAS ignores it,
warns, and a hardcoded value only makes it look like incrementing is broken.

The **marketing version** (`expo.version` → `CFBundleShortVersionString`) is
*not* covered by that and never auto-increments: eas-cli throws
`{"autoIncrement": "version"} is not supported when app version source is set
to remote`. `scripts/bump-version.mjs` fills the gap, which is why releases go
through `npm run release:ios` rather than a bare `eas build`. It rewrites the
single version line with a targeted regex — app.json's hand-tuned compact
arrays (`intentFilters`, `associatedDomains`) must not be reflowed by a
`JSON.stringify` round-trip.

Apple closes a version train once that version is **released**; every later
build needs a strictly higher `CFBundleShortVersionString`, or App Store Connect
rejects it with `90186 Invalid Pre-Release Train` and `90062`. Builds *within*
an unreleased train need only a new build number, so bump the version per
release, not per build.

## Metro monorepo resolution

`@gracechords/core` is consumed as **TypeScript source with no build step** (its
`main` is `src/index.ts`), so Metro must watch the workspace package dirs for
edits to hot-reload. `expo/metro-config` already derives that from the root
`workspaces` globs, so `metro.config.js` carries **no overrides** — it is
`getDefaultConfig(__dirname)` and should stay that way. Metro transpiles core's
`.ts` through `babel-preset-expo`; do **not** add a build step to core to make
mobile work.

React is **not** deduplicated by anything in `metro.config.js`. npm hoists
`react@18.2.0` to the root for `apps/web` while mobile keeps `19.2.0` nested,
but Expo CLI's sticky resolution pins `react`, `react-dom`, `react-native` and
`@react-navigation/{core,native}` to the app's copy by module *name* regardless
of the importer — see `KNOWN_STICKY_DEPENDENCIES` in `@expo/cli`'s
`createExpoAutolinkingResolver`. Both `expo export` bundles contain exactly one
react. expo-doctor's duplicate-dependency warning describes the install tree,
not the bundle.

## Supabase

- Wired through core's `createGcSupabase({ url, anonKey, storage, auth })` —
  **never** call `createClient` directly here.
- Storage adapter is `@react-native-async-storage/async-storage`;
  `detectSessionInUrl` is forced `false` (no URL redirect on native);
  `persistSession`/`autoRefreshToken` keep the factory defaults (`true`).
- Token refresh is driven by `AppState` (`registerAuthAutoRefresh` in
  `src/lib/supabase.ts`), called once at the app root.
- A **dead persisted refresh token** (signed out elsewhere, token rotated,
  session deleted) is benign and self-healing: `resolveInitialSession`
  (`src/lib/authSession.ts`) purges it locally at launch and the gate routes to
  `/login`. But GoTrue also logs it to `console.error` from inside its own
  automatic init (`_recoverAndRefresh`, run when the client is constructed) —
  before any of our code can react, and with no config hook to disable that one
  call. `silenceInvalidRefreshTokenLogs` wraps `console.error` once (installed in
  `src/lib/supabase.ts` **before** the client is created) to drop exactly that
  self-healing error; everything else passes through. Don't "fix" this by
  flipping `autoRefreshToken` off — that changes real refresh behavior and
  relies on GoTrue internals.
- Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
  `apps/mobile/.env` (the **public anon** key — same as the web client, never the
  service-role key). Mirror any new `EXPO_PUBLIC_*` var into `.env.example`.

## Consuming core

Mobile uses core's exports only. If a query/util is missing, add an **additive**
export to `packages/core` (see `songs/songsRepo.js` → `fetchSongList`); never
duplicate logic here and never edit core internals to suit mobile.

## Theme & tokens

- Colors/spacing/radii/type come from `@gracechords/tokens/native`
  (`packages/tokens/native.ts`) — the iOS Signal-blue palette, light + dark.
  **Never hardcode hex values** in the app.
- Consume via `useTheme()` from `src/theme/ThemeProvider.tsx`
  (`const t = useTheme()` → `t.colors.*`, `t.spacing.*`, `t.radii.*`,
  `t.typography.*`). The provider follows the system scheme (`app.json`
  `userInterfaceStyle: automatic`); **both light and dark must look correct**.
- New shared token values (e.g. the hero gradient) go in `native.ts`, not inline.

## Primitives & UI conventions

- Reusable primitives live in `src/components/`: `Screen`, `Button`, `Card`,
  `ListRow`, `Chip`, `SectionHeader`, `ConstrainedContent`. Prefer them over
  bespoke views.
- **Tablet content width:** wrap screen content in `ConstrainedContent`
  (`tier="form"` ≈ 440 / `tier="content"` ≈ 700, values in tokens
  `layout.maxWidth`). It passes through untouched at compact (phone) width and
  caps + centers at regular (tablet) width (`useIsTabletWidth`). Applied to
  Auth (form), Home and the Setlists index (content).
- **Home dashboard:** Home is a card dashboard (`src/components/home/` —
  `DailyWordCard`, `RecentSongsCard`, shared `cardStyle`): hero + Continue card
  full-width (capped at tokens `layout.maxWidth.dashboard`), then Last set /
  Starred / Daily Word / Recent songs — a 2-column grid at regular width, one
  stack on phones (same components, only the arrangement differs). The
  Recent-songs count comes from tokens `layout.recentSongs`.
- **Song Library tablet grid:** at regular width the library's SectionList
  chunks each letter section's songs into rows of N `ListRow` cells
  (`src/lib/gridRows.ts`; N from tokens `layout.libraryColumns` — 2 portrait,
  3 landscape). Presentation-only: sections, sticky full-width headers, the
  A–Z scrubber's section-index jumps, and search/sort logic are unchanged, and
  phones keep the unchunked single-column list.
- **Setlist Builder tablet split:** at regular width the builder becomes a
  list-detail split (ratio from tokens `layout.split`, ~1/3 · 2/3): a
  searchable `LibraryPane` (`src/components/setlist/LibraryPane.tsx` — its own
  list instance, not shared with the Songs tab) on the left with the same
  tap-to-toggle add semantics as `AddSongsModal` (`toggleSong` — one write
  path, autosave applies), the unchanged builder column on the right. Phones
  render the single-column builder untouched (the Add button/modal is
  phone-only — the pane is the add flow on tablets).
- **Utilities tablet split:** same `layout.split` list-detail shape — the tool
  list on the left, the picked tool rendered inline on the right via each tool
  screen's `embedded` prop (hides its back link / safe-area bar padding), with
  a "Pick a tool" placeholder until one is selected. Phones keep pushing
  `/tuner`, `/metronome`, `/pitch-pipe`, `/songbook`, `/capo`,
  `/key-reference` as routes.
- **Key Reference** (`app/key-reference.tsx` → `KeyReferenceScreen`, components
  in `src/components/keyref/`, logic in `src/lib/keyref/`) — a cropped
  circle-of-fifths dial under the four pinned progressions. Standalone: the key
  is chosen by turning the dial, never seeded from a song or setlist. The dial's
  face is filled (`accentSoft`) so the wheel reads as an object, and it is
  extended by the home-indicator inset so the circle runs off the bottom of the
  screen rather than stopping on a hard edge above it, and the **tonic
  is marked by a static index halo at the top of the dial** — it does not rotate;
  bubbles travel through it, the way a physical dial says "whatever is here is
  the current value". That halo uses the `spotlight`/`spotlightSoft` tokens (a
  muted violet added to `native.ts` for it), NOT the accent: the accent means "in
  the selected progression" everywhere else on this screen, and one colour cannot
  carry both jobs.
  - **Progressions are stored NUMERICALLY** (`types.ts` / `progressions.ts`):
    scale degree + optional quality override + optional bass degree + optional
    extension. Letters are a view computed per key in `render.ts`, which is the
    only module that turns a degree into a note. Canonical text is `1`, `1/3`,
    `5/7`, `2maj`, `2m7`; **a bare `7` is the vii° chord and is never shorthand
    for `5/7`** (nor `3` for `1/3`), and `parseChordToken` throws rather than
    guessing. Two sets ship: 19 diatonic **General** (inversions included — a
    slash chord is still a chord of the key) and the 14-entry **Prayer** set,
    whose two source annotations are `noteKey`s shown in a sheet rather than
    encoded as playable data. Every id needs a label in
    `i18n/locales/*/utilities.json` — a missing one renders the raw key on
    screen rather than failing anywhere, so a test asserts the two lists match.
  - **Both rings run at TRUE 30° circle-of-fifths spacing** (`arcGeometry.ts`),
    concentric — but the inner ring is rotated **half a step**
    (`minorAngleOffset`) so its FOUR bubbles sit centred under the tonic instead
    of hanging off to the right of the outer ring's three. Each minor therefore
    sits between two majors, which is the classic chord-wheel offset ring. That
    only fits because the outer radius is 172 and the inner 116: at an earlier 97pt inner radius
    the true chord between adjacent minors is 50pt, which leaves 44pt bubbles a
    6pt gap, and the ring had to be widened to 36° to compensate. **Don't
    reintroduce that fudge** — grow the radii instead. The outer radius is
    capped by WIDTH: at 375pt the widest bubbles reach ±175.2 against a 187.5pt
    half-width. Tune the numbers there, not in the component;
    `__tests__/arcGeometry.test.ts` asserts the 44pt floor, non-overlap, the
    true spacing, and the 375pt fit.
  - **Two stroked rings are what make it read as a wheel.** Without them the
    bubbles read as scattered chips. They are bordered `View`s wider than the
    frame, cropped by its `overflow: 'hidden'` — the same technique
    `PitchPipeScreen` uses for its ring. **`react-native-svg` is not installed
    and is not needed**; don't add a native dep for this.
    A circle through the bubble centres is widest at ±R, so it *cannot* reach
    the screen edge without flattening the arc (R > 187.5 forces the drop from
    85pt down to ~62pt). The crop instead cuts both strokes at the box's bottom
    edge — outer at ±168.8, 18.7pt from each corner on a near-vertical tangent.
    Curvature was the problem; curvature wins.
  - The arc box is **full-bleed and self-measuring** (`onLayout`, not
    `useWindowDimensions`): in landscape the safe-area inset makes the available
    width narrower than the window, and a window-width circle would be centred
    off-centre and overflow.
  - **Detent ticks** sit at the half-step MIDPOINTS, not at the 30° positions —
    the bubbles are already there and would cover them. They travel with the
    wheel, so a drag demonstrates rotation instead of a label describing it.
  - **Rotation is the only source of truth for angle** (`KeyArc`). It
    accumulates and is never reset, and the key is derived from it. Deriving
    bubble positions from the key instead would need key and rotation to change
    in the same frame on every commit; whichever landed first would jump the
    arc 30°. A commit changes labels only.
  - Drag math is pure worklets in `keyWheel.ts` and the haptic policy is a pure
    injected-clock module in `wheelHaptics.ts`, both unit-tested headless — the
    same split `readerSwipe.ts` uses. **No velocity is consulted anywhere**, so
    the wheel never flings. iOS ticks per 30° crossing and locks Medium on
    release (suppressed within 80ms of a tick; a crossing-free release still
    locks). **Android is deliberately silent** — its rotational motor buzzes
    rather than ticks. Do not add a fallback.
  - The **vii° lives on the inner ring at slot +2**, continuing it in fifths:
    ii vi iii vii°. Outer ring = the three majors, inner = the four
    everything-else chords, and between them all seven diatonic chords on two
    clean rings. The inner ring is **deliberately asymmetric** — nothing sits
    left of ii, because the chord that would go there is not in the key, and
    inventing one to balance the drawing would make the picture prettier and the
    teaching worse. `bubbleOpacity` is therefore asymmetric on that ring: slot
    +2 stays solid even though the faded neighbour directly above it does not,
    since the vii° *is* diatonic.
  - A non-diatonic chord (the Prayer set's `2maj`) never takes the solid accent
    fill: it stays outlined and its own labels carry the altered spelling, so
    the diatonic ii is never shown lit in place of the chord being played.
  - **The whole library is one scrolling list**, grouped by set, each row showing
    its chords (`ProgressionList`). Two earlier revisions narrowed this — four
    name-only chips with a picker sheet, then four pinned rows — and both were a
    lot of machinery to show an eighth of the data, so the pinning, the picker
    and the per-slot long-press are gone. A bass line under each chord was also
    tried and removed: a slash chord already carries its bass in its own name
    (`D/F#`), so it only said anything new on the entries with inversions.
  - **Three display modes**, on a switcher PINNED above the list so the one
    control that reprints every row never scrolls away from them: `letters`,
    `numbers` (the canonical Arabic form the data is stored in) and `nashville`
    (roman-numeral analysis, where the case of the numeral carries the quality —
    `II` is a borrowed major, `ii` the diatonic minor). An inversion keeps an
    Arabic bass in roman mode (`V/7`, not `V/VII`): a roman numeral names a
    chord, so a roman bass would read as a second chord. The dial's numerals
    follow the toggle through `numberStyleFor`.
  - The selected progression + the display mode persist in `keyRefPrefs.ts`
    (`gc.keyref.v1`, injected storage / `useSyncExternalStore`). Screen-scoped,
    so it hydrates on mount and is **not** in `LAUNCH_STORAGE_KEYS`. The
    selected key is deliberately not persisted.
- **Option sheets:** every sheet presents through the native `formSheet` route
  (`app/sheet.tsx` + `src/lib/formSheetHost.ts` — screens keep owning
  state/callbacks; the host bridges the render into the route, one sheet at a
  time). Phones get a native bottom sheet with grabber/detents, iPads a
  centered narrow form sheet. The ONE exception is the builder's
  `RowActionsSheet`, which stays on the hand-rolled `BottomSheet` Modal because
  it chains into the key picker via `onDismissed`; if you add a new sheet, use
  the `useFormSheet` + `FormSheetShell` pattern.
  **The bottom safe-area inset belongs to the host, not the sheet.** `app/sheet.tsx`
  pads its surface-painted wrapper by `insets.bottom` for every sheet — a
  `fitToContents` sheet is only as tall as its React content, so content that stops
  short of the home indicator leaves that strip uncovered and the screen behind
  shows through. Sheet content must **not** add `insets.bottom` of its own (it
  would double the gap, and inside a `maxHeight` ScrollView's
  `contentContainerStyle` it just scrolls away instead of extending the sheet).
- **Icons are native design-system glyphs only** (no hand-drawn/SVG), always via
  `src/components/SymbolIcon.tsx`. Call sites pass a single SF Symbol `name`;
  `SymbolIcon` branches internally on `Platform.OS`: iOS renders it through
  `expo-symbols` (`SymbolView`), Android maps the SF name to a Material Symbols
  glyph via `src/components/symbolMap.ts` and renders it from the subset fonts in
  `assets/fonts/` (`MaterialSymbolsOutlined`/`MaterialSymbolsFilled`, registered
  in `app/_layout.tsx`). **When you introduce a new icon, add its SF→Material
  mapping to `SF_TO_MATERIAL` in `symbolMap.ts`, then run
  `python3 scripts/build-symbol-fonts.py`** (needs `pip install fonttools`) so the
  Android glyph exists — an unmapped name renders a fallback and warns in dev. That
  script pins two static instances of the upstream Material Symbols variable font
  (FILL=0/1), subsets them to just the glyphs `SF_TO_MATERIAL` names, and
  regenerates the `MATERIAL_CODEPOINTS` block; commit the two `.ttf` files with it.
  Pass the optional `md` prop only to override an ambiguous auto-mapping (iOS
  ignores it).
  The tab bar (`app/(tabs)/_layout.tsx`) is separate — it uses
  `NativeTabs.Trigger.Icon` with explicit `sf`/`md`, but follows the same
  SF→Material naming convention.
- Gradients use `expo-linear-gradient` with tokens from `native.ts`
  (`heroGradient`/`heroGlow`). The atmospheric Home hero is the **only** sanctioned
  gradient — never a UI-surface gradient. (RN has no radial gradient; the hero
  approximates it with a linear gradient + a soft glow overlay.)
- Screens live in `src/screens/`; route files under `app/` are thin wrappers that
  render them.

## Routing, screens & auth

- `app/(tabs)/_layout.tsx` — the four-tab shell (Home · Songs · Setlists · Daily
  Word), `headerShown:false` (screens draw their own large-title headers).
- Routes **outside** the tab group push over the shell: `app/viewer/[slug].tsx`
  (Song Viewer — real chord chart), `app/perform/[id].tsx` (Performer / setlist
  play-through → `PerformerScreen`), `app/setlist/[id].tsx` (Setlist Builder),
  `app/settings.tsx`, `app/about.tsx`, and `app/offline.tsx` (Offline &
  downloads — scaffolded, no download logic yet). `app/login.tsx` — the auth
  screen (sign in + sign up modes in `src/screens/AuthScreen.tsx`);
  `app/choose-icon.tsx` — the post-signup sprite avatar picker.
- **First-launch intro** (`app/intro.tsx` → `src/screens/IntroScreen.tsx`): a
  three-card pager shown once per device, post-auth. Card 1 is a centered title
  card, card 2 lists features (each icon borrowed from the live UI that owns it),
  and card 3 carries two **real settings** — the Daily Word reminder (with the
  Settings screen's own `ReminderTimeSheet`) and the reading streak — both
  presented pre-toggled ON. The seen-flag is device-local
  (`src/lib/introSeen.ts`, `gc.intro.seen.v1`, in the splash `multiGet` batch so
  the gate can read it synchronously); it is **not** on the Supabase profile, so a
  returning user on a new device sees the intro again by design. `wantsIntro()` in
  `app/_layout.tsx` scopes the redirect to the app's own entry points (bare root /
  `(tabs)`) so an inbound deep link keeps its destination. Both exits land on
  **Home**; "Get started" commits card 3's settings and is the **only** place
  notification permission is requested (via `commitOnboardingReminder`, which
  checks permission before prompting and fails silently on denial), while **Skip
  commits nothing**. Settings → Support → "See onboarding again" clears the flag
  to replay it.
- **Authenticated-only.** `app/_layout.tsx` gates every route on the Supabase
  session (redirect to `/login` when signed out, into the tabs when signed in) and
  holds the native splash (`expo-splash-screen`) until the session resolves *and*
  the correct screen is mounted, so nothing flashes on first open. The hold then
  hands off to `src/components/SplashOverlay.tsx` — a view drawn pixel-identical to
  the native splash (transparent `assets/splash-icon*.png` mark at `imageWidth`,
  system-appearance background) that zooms the mark out and cross-fades to reveal
  the app, honours Reduce Motion, and owns the **only** `hideAsync()` call on the
  normal launch path (`ConfigErrorScreen` still lifts it directly). Session persists
  via AsyncStorage until uninstall — don't add proactive sign-outs. Exception:
  `choose-icon` is reachable both with and without a session (post-signup step —
  email confirmation may still be pending).
- **Deep links / Universal Links.** iOS Universal Links are wired via
  `ios.associatedDomains: ["applinks:gracechords.com"]` (apex only, no `www`);
  Android App Links via `android.intentFilters` in `app.json`. Which paths each
  platform claims lives in the **web** repo — the AASA file at
  `apps/web/public/.well-known/apple-app-site-association` and `assetlinks.json`
  beside it. **`apps/web/public/.well-known/README.md` holds the canonical claim
  table**; those three files plus `app.json` must agree. Paths are enumerated,
  never wildcarded across the domain, because Android has no exclusion
  mechanism — auth (`/login`, `/auth/callback`, `/reset-password`, …), the
  admin/editor portal, and the legal pages the app links *out* to are
  deliberately unclaimed.
  - **The mapping is `src/lib/deepLinks.ts`** (`resolveDeepLinkPath`, pure and
    unit-tested — one case per claim-table row). `app/+native-intent.tsx` is a
    thin `redirectSystemPath` wrapper over it. Add a claim in three places at
    once: AASA, `android.intentFilters`, and `deepLinks.ts` (+ a test).
  - `/song/:id`, `/songs/:id` (id == slug) → `/viewer/:slug` (the app has no
    `/song` route).
  - Shared setlists `/setlist/<slugs>?toKeys=`, `/set/<CODE>`, and the
    `/worship/...` mirrors → `/setlist/import` (the read-only import preview,
    `SetlistImportScreen`). Decode/resolve lives in `src/lib/setlistImport.ts`
    (unit-tested), reusing core `decodeSet` for the compact code form and a plain
    split for the slug-list form; slugs resolve against the shared catalog, misses
    are dropped with a warning, and "Save to my setlists" creates a normal setlist
    row (default name "Imported setlist"). Shared links never carry a title.
  - `/s/:code` → `/session/:code`. Index/landing pages map to their tab
    (`/` → home, `/songs`, `/setlist` → `/setlists`, `/reading` → `/daily`), and
    web-only pages with no counterpart (the blog) resolve to the home tab rather
    than dead-ending. Anything unrecognised passes through unchanged, which is
    what keeps `gracechords://` links working.
  - **Build impact differs per platform.** Editing `associatedDomains` or
    `intentFilters` needs a **fresh native build** (prebuild + EAS), not an OTA.
    But adding a *path* is only an AASA edit on iOS — no new build, just a web
    deploy (devices cache the AASA, so expect refresh lag). Android compiles its
    filters into `AndroidManifest.xml`, so a path change there **does** need a
    rebuild.
  - **Known gap:** a deep link is lost when signed out. `app/_layout.tsx` treats
    only the `session` segment as public, so any other inbound link redirects to
    `/login` and the destination is discarded rather than resumed after sign-in.
- **Auth flows.** Email/password plus native Google
  (`@react-native-google-signin/google-signin`) and Apple
  (`expo-apple-authentication`, iOS-only button) via
  `supabase.auth.signInWithIdToken`. The orchestration lives in
  `src/lib/authFlows.ts` as dependency-injected, RN-free functions (tested with
  vitest — `npm run test`); the only native-importing glue is
  `src/lib/authDeps.ts`. Google client ids come from
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and the
  reversed iOS client id must be set in `app.json` → google-signin plugin
  `iosUrlScheme`. **Android additionally needs its own "Android"-type OAuth
  client** (package `com.gracechords.app` + the signing SHA-1) in the same
  Google Cloud project — its id never appears in code, Google matches the app by
  package + SHA-1. Without it the account picker shows and then sign-in fails
  with `DEVELOPER_ERROR` (code 10), which `googleSignIn` maps to
  `errors.googleConfigError` (register the SHA-1 of every signing key you ship —
  local debug keystore and the EAS/Play App Signing key). Supabase's Google
  provider must have **"Skip nonce checks"**
  enabled: iOS embeds a nonce in the id-token that the free google-signin lib
  can't reproduce, so otherwise `signInWithIdToken` rejects it ("Passed nonce and
  nonce in id_token should either both exist or not"). Apple is unaffected — it
  drives the raw/hashed nonce pair itself (see `appleSignIn`). The sprite pick is written to `users.preferences.sprite`
  (`src/lib/profile.ts`) — the same JSONB shape the web Profile page writes; ids in
  `src/lib/sprites.ts` must stay in sync with web's `SpritePicker.jsx`. The
  artwork is shared too, but **not the file format**: web serves the `.webp`
  originals, mobile ships PNGs generated from them, because RN's `Image`
  decodes WebP on Android only and a `.webp` avatar renders as nothing on iOS.
  See `assets/README.md` for the regeneration command.

## Song Viewer, Performer & export

- **Song Viewer** (`app/viewer/[slug].tsx` + `src/components/ChordChart.tsx`)
  renders a parsed `SongDoc` (core `parseChordProOrLegacy`): word-anchored chords
  over lyrics, per-symbol transpose + chord style at render, `RawFallback` when a
  parse yields nothing. Controls: floating `TransposeBar` (±1 semitone, haptic),
  `ViewOptionsSheet` (chords/lyrics · section labels · font scale 80–160% · chord
  style Letters/Solfège · sharp/flat accidentals · columns 1│2 on tablet widths ·
  "Hide controls when idle"),
  `StarButton`, and `ExportSheet`. Transpose/accidentals/chord-style are
  **ephemeral** per open; "Hide controls when idle" persists (separately, in
  `src/lib/autoHideChrome.ts`) and the column mode persists **per song**
  (device-local, `src/lib/viewerPrefs.ts`). Opening from a setlist seeds
  transpose via the `initialKey` route param.
- **Two-column mode** (`src/components/TwoColumnChart.tsx` +
  `src/lib/columnLayout.ts`): tablet-only (`src/lib/useIsTabletWidth.ts`, min
  window dimension ≥ 600 — phones never see the toggle), fill-first packing
  (never balanced), sections atomic (never split), single-column rendering is
  the untouched baseline, and double only engages when a single column would
  overflow the viewport. Section heights are measured offscreen and memoized
  per width/font/transpose/chord-style/accidental/visibility inputs; the
  partition + persistence logic is unit-tested headless (`npm run test`).
- **Performer** (`app/perform/[id].tsx` → `PerformerScreen`) runs a set one song
  at a time (Prev/Next, swipe, tappable progress rail), prefetches every song
  body, and reuses the same chart/transpose/view-options. Its
  `PerformerShareSheet` has a This-song / Whole-set scope toggle — whole-set PDF
  works here (not in the builder's `ShareSetSheet`).
- **Export/share** is server-side via the web app's Pages Functions (base
  `EXPO_PUBLIC_API_BASE_URL`, `src/lib/api.ts`): `src/lib/exportSong.ts` calls
  `POST /api/export/song` (PDF, or a page-1 PNG for `jpg`) and
  `POST /api/export/setlist` (whole-set PDF); bytes are cached with
  `expo-file-system` and handed to the system share sheet via `expo-sharing`.
  `src/lib/telegramPush.ts` posts to `/api/telegram/push` (song + setlist,
  batched at 25; 409 → "link your Telegram" alert). **Charts ZIP / ChordPro
  export backends don't exist anywhere** — those tiles render disabled.

## Settings & defaults

- **Settings** (`app/settings.tsx` → `SettingsScreen`) is a grouped screen:
  profile card (→ sprite picker), theme, chord style, **Language**, Offline &
  downloads, a **Reader** section (Daily Word reminder — see below), library
  shortcuts, Help/Feedback, About, sign-out, and **Delete account**
  (`supabase.rpc('delete_user')`). The Language row opens an `OptionSheet`
  (Automatic + the supported locales) and shows the resolved language — see the
  i18n section below.
- **Daily Word reminder** (Settings → Reader) is an OPT-IN local notification via
  **`expo-notifications`** (config plugin in `app.json`). The stored default is
  **off at 8:00 AM** (`DEFAULT_READER_REMINDER`), but the first-launch intro's
  card 3 presents it pre-toggled ON, so a user who taps "Get started" opts in
  there rather than in Settings — see the first-launch intro bullet under
  "Routing, screens & auth". The
  preference (enabled + local hour/minute) is device-local in AsyncStorage
  (`gc.readerReminder.v1`), following the `defaults.ts` injected-storage /
  `useSyncExternalStore` pattern. `src/lib/readerReminder.ts` is the **pure,
  RN-free** store plus the dependency-injected `syncReminder()` reconciler (and
  a locale-aware `formatReminderTime`), unit-tested headless;
  `src/lib/readerReminderService.ts` wires the real expo-notifications backend
  (permission request, a single daily-repeating notification under a stable id,
  the foreground handler, and the tap→`/daily` deep link). Enabling requests
  notification permission (iOS shows the system prompt then) and only
  persists/schedules on grant, steering the user to system Settings on denial.
  The time is set with the **platform's own time picker**
  (`ReminderTimeSheet`, on `@react-native-community/datetimepicker`) — never a
  hand-rolled stepper: iOS renders the UIDatePicker wheels (`display="spinner"`,
  `themeVariant` from the resolved theme so a forced light/dark override is
  honored) inside the usual native `formSheet` and commits the draft on **Done**;
  Android opens the native clock dialog imperatively (`DateTimePickerAndroid.open`,
  no form sheet) and commits only on its OK. Its `design: 'material'` (MD3) mode is
  deliberately NOT used — that requires a `Theme.Material3.*` `styles.xml`, which
  under CNG would mean a config plugin. 12- vs 24-hour presentation follows the
  **app language** (`usesTwentyFourHourClock` in `readerReminder.ts`, same Intl
  resolution as `formatReminderTime`), so the picker and the Settings row always
  agree. The app root
  hydrates the preference at splash and reconciles the OS schedule on launch.
- **App-wide defaults** live in `src/lib/defaults.ts` — `theme`
  (`system`/`light`/`dark`) and `chordStyle` (`letters`/`solfege`), **device-local
  in AsyncStorage, not Supabase-synced**. Storage is injected (KVStorage, like
  `profile.ts`) so the module is RN-free and unit-tested. Hydrated once at the
  splash hold; `getDefaultsSnapshot()` is then synchronous and `useAppDefaults()`
  (a `useSyncExternalStore` hook) re-renders the ThemeProvider and Settings.
  Viewer/Performer seed their chord style read-on-open; in-session changes don't
  write back.

## In-app review request

Native store review (`expo-store-review` → `SKStoreReviewController` on iOS, Play
In-App Review on Android), asked for after a genuinely positive interaction. **The
OS sheet is the entire UI** — there is no pre-prompt, no "Enjoying GraceChords?"
gate, no stars of our own, and deliberately no "Rate GraceChords" Settings row
(if one is ever added it must DEEP-LINK to the store page, never call
`requestReview`, because a tap that silently does nothing is worse than no row).

The platform gives **no callback**: we cannot tell whether the sheet rendered,
whether anyone rated, or whether the OS silently swallowed the call because its
own cap (~3/year on iOS) was spent. Every request is therefore a spent,
unverifiable attempt, which is why the gates below are as conservative as they
are — and why the attempt is banked *before* the native call is awaited.

- `src/lib/routeDwell.ts` — **pure**, injected clock. Accumulates foreground-only
  time on the current route. Backgrounded time does not count, and the shared
  `sheet` route is treated as an **overlay** (freeze, then resume) rather than a
  departure, because every sheet in the app is a real router navigation via
  `formSheetHost`. Dwell is keyed on the resolved `usePathname()`, so song A →
  song B ends A's visit instead of pooling two half-reads.
- `src/lib/reviewEligibility.ts` — **pure**. The whole policy in one function,
  returning a decision *plus a human-readable reason*. Triggers: 90 s+ foreground
  dwell on `viewer/[slug]` or `perform/[id]`, or leaving the reader with a
  4+ day streak. Then: production build, no session error, 7+ days since first
  launch, 3+ distinct open days, intro seen before *this* launch, under 3 lifetime
  requests, 120+ days since the last.
- `src/lib/reviewState.ts` — device-local persistence (`gc.review.v1`, joined to
  the `launchStorage.ts` batch). **Bounded by construction:** distinct open days
  are a count plus one date, never a list. Nothing touches the Supabase profile.
- `src/lib/sessionError.ts` — in-memory only, never persisted. `markSessionError`
  is called from `errors.ts` (below the `isAbortError` check — a user
  cancellation is not a bad experience), `api.ts`, `exportSong.ts` and
  `AuthScreen.tsx`. Asking someone to rate the app minutes after their export
  failed is the most expensive mistake this feature can make.
- `src/lib/reviewService.ts` — the native half (`expo-store-review`, `AppState`,
  `useSegments`/`usePathname`), mounted **once** as `useReviewObserver()` in the
  root layout. Same pure-store/service split as `readerReminder*.ts`.

Two things to know before touching it:

- **It derives everything from navigation state.** The Song Viewer, Performer and
  Daily Word reader know nothing about it and must stay that way.
- **Production detection is asymmetric.** On iOS, `StoreReview.isAvailableAsync()`
  is a genuine signal — its native implementation returns false when the bundle
  has a sandbox receipt and no embedded provisioning profile, i.e. TestFlight and
  Xcode installs. On **Android it is not**: it only checks that the Play Store app
  is installed, and Play internal/closed testing serves the *same production AAB*
  from the same store, so `EXPO_PUBLIC_BUILD_PROFILE` (injected per profile in
  `eas.json`) can rule out dev clients and `preview` APKs but **cannot** rule out
  the internal-testing track. Nothing available at runtime can. Do not "fix" this
  with `expo-application`'s `getIosApplicationReleaseTypeAsync()` either — it
  reports `APP_STORE` for TestFlight builds too, since neither has an embedded
  profile.

Because the sheet does not appear in TestFlight and is unreliable in Play internal
testing, **dev builds never call the API**: eligibility is evaluated in full, the
decision and every input are logged (`[review] would request now (trigger=dwell,
…)`), and near-misses log the specific failing gate. That log is the supported way
to verify changes here; `src/lib/__tests__/reviewFlow.test.ts` covers the same
scenarios headless.

## Data & stubs

- Song data uses core's `fetchSongList` (widen columns via its `opts.columns`);
  screen data hooks live in `src/lib/` (`useSongList`, `useStarredSongs`).
- **Stars** are per-user Supabase data — table `user_starred_songs` (`song_id` is a
  uuid FK to `songs.id`, RLS-scoped to `auth.uid()`). `useStarredSongs` reads the
  list via an inline joined query; `useSongStar` reads/writes a single song's star
  optimistically (upsert/delete, revert on failure) behind the Viewer's
  `StarButton`. These inline queries are the **one sanctioned exception** to
  "queries live in core" — kept in mobile to avoid a core change; promote them to
  core when stars grow.
- **Setlists are per-user Supabase data** — tables `setlists` / `setlist_songs`
  (per-entry key override in `setlist_songs.key_override`, exposed app-side as
  `toKey`). Queries live in core's `setlistsRepo` (injected client); mobile hooks
  are `useSetlists`, `useSetlistBuilder` (debounced wipe-and-replace autosave),
  and `useLastSet` (Home's "Last set" card).
- **Recently-opened history** is real and device-local. `src/lib/recents.ts`
  follows the `defaults.ts` pattern: storage is injected (`KVStorage`), hydrated
  once at splash, then `getRecentlyOpened()` is **synchronous** (Home reads it in
  render, no flash). The Viewer calls `recordSongOpened()` on load — it dedupes by
  slug, moves the entry to the front, and caps at 20 (`gc.recents.songs.v1` in
  AsyncStorage, NOT Supabase-synced). Feeds Home's "Continue where you left off"
  and its Recent-songs card. Each entry also stores `lastKey` — the key showing
  in the viewer (`updateRecentKey` mirrors the effective key as it changes) —
  and the Recent-songs card reopens the song in that key via the viewer's
  existing `initialKey` param (Library opens still use the default key).
- **Reading streak** (`src/lib/readingStreak.ts`, same injected-storage /
  `useSyncExternalStore` pattern): OPT-IN — the stored default is off
  (`DEFAULT_READING_STREAK`), but like the reminder above, the first-launch
  intro's card 3 presents it pre-toggled ON, so most new users arrive with it
  enabled. The toggle also lives in
  **Settings → Reader** (alongside the Daily Word reminder), not the reader
  settings sheet, and `DailyWordScreen` marks a day read
  when one of TODAY's chapters renders. Home's Daily Word card shows the streak
  only when enabled (`currentStreak` — 0 once a day is missed). Unit-tested.
  Editable greeting phrases live in `src/lib/greetings.ts` (`SUB_GREETINGS`).
- **Daily Word landing + reflections.** The Daily Word tab opens a **landing
  hub** (`DailyWordLandingScreen`) by default — today's M'Cheyne reading + the
  signed-in user's own **private reflection** — routing onward to the Reader
  (pushed `app/daily/reader.tsx`, which shows a back chevron via
  `DailyWordScreen`'s `showBackToLanding` prop; the reader-direct tab root has
  none). A **Settings → Reader** toggle ("Daily Word opens", stored in
  `defaults.ts` as `dailyWordDestination`) switches the tab to open the Reader
  directly, bypassing the landing. Reflections are private per-user Supabase data
  — table `public.reflections` (migration
  `supabase/migrations/20260719000000_create_reflections.sql`), owner-scoped RLS,
  one private reflection per day (unique index). **Private reflections are
  editable** — migration `20260719000400_edit_private_reflections.sql` adds a
  tightly-scoped `own_update_private` UPDATE policy (owner + `visibility='private'`
  in both USING and WITH CHECK, so a public post can never be edited and an edit
  can't flip a private row to public); `updateReflection` in core drives it, and
  the composer's edit mode (`editId`/`initialBody`/`date` params) + the landing/
  journal "Edit" actions reach it. Queries live in
  core (`reflections/reflectionsRepo.js`); mobile hooks are
  `useTodayReflection`/`useReflectionList` (both expose `update`).
  **Reflections are private-only. The public "Shared Reflections" feature is
  gone** — App Review rejected 1.0.0 (11) under Guideline 1.2 (anonymous
  user-generated content). PR 469 deleted every client surface (the feed, the
  Private/Shared toggle, hearts, report/hide, the UGC terms gate and its
  `accept_ugc_terms()` call) and narrowed core's `ReflectionVisibility` to
  `'private'`, so reintroducing a public write is a type error. Migration
  `20260805000000_retire_public_reflections_age_gate.sql` retired the backend:
  `public_reflections` flag **off** and the `public_feed_read` policy **dropped**.
  The moderation tables and the `submit`/`report` Pages Functions still exist but
  are inert — see `apps/web/AGENTS.md` → "Public reflections moderation
  (backend — RETIRED)" for why they were kept. The `visibility` column and the
  `own_update_private` policy's `visibility='private'` clauses remain as the
  belt-and-braces that keep a public row from ever being written or edited from a
  client. Do not build a public-content surface here without reopening the
  Guideline 1.2 question first. The
  landing's **devotional** hero card + long-read page from the design are
  **dropped** (no public-domain content pipeline was ever built), and the landing's
  lead slot — above today's reading — is now unused.
- **Daily Word / Reader** reads the day's M'Cheyne passages from Cloudflare R2.
  Shared, DOM-free logic (plan lookup, reading expansion, translation manifest,
  RTL, chapter/copy helpers) lives in core's `bible` module (`@gracechords/core`),
  base-URL injected. `src/lib/bibleSource.ts` is the **single source seam**
  (`getPassage`/`getTranslations`) via `EXPO_PUBLIC_R2_PUBLIC_URL`
  (default `https://assets.gracechords.com`); it now reads **offline-first** —
  `getPassage` returns a downloaded chapter blob when one exists (see the
  downloads module below) and falls back to R2 otherwise. Hooks:
  `useBibleTranslations`, `usePassageChapter` (`src/lib/useReader.ts`). Reader
  settings (size/typeface/layout/spacing) **persist device-local** in
  `src/lib/readerSettings.ts` (`gc.reader.settings.v1`, same injected-storage /
  `useSyncExternalStore` pattern as `defaults.ts`, hydrated in the splash
  `multiGet` batch): they are readability preferences, so they outlive the
  reader, a relaunch and an app update. The text-options sheet stays controlled —
  it reports through `onChange` and the screen writes to the store. Parsing is
  per-field, so a corrupt record costs only the bad fields. **Follow-up:**
  `apps/web`'s `features/readings` + `utils/bible` still hold their own copy of
  this logic; migrate web onto core's `bible` module to remove the duplication.
  - **Scroll position is per passage chip, and session-scoped.** Each chip keeps
    its own offset while the reader is open (refs in `DailyWordScreen`, so a
    scroll never re-renders the reading): chips open at the top, returning to one
    restores where you left it, and closing the reader resets them all. The
    reading `ScrollView` is keyed on the passage id so a chapter can never
    inherit its predecessor's offset; the saved offset is re-applied on the first
    `onContentSizeChange` after a passage change.
  - **Verse numerals are inline `<View>`s** (`src/components/reader/VerseNumber.tsx`),
    not nested `<Text>`. React Native has no per-run baseline offset on either
    platform, and an inline view is the one thing both text engines position
    relative to the baseline — that is what lifts the numeral out of the bottom
    of the line box. Its metrics live in `readerSettings.ts` and are unit-tested
    to stay shorter than the line's ascent at every size/spacing pair, so a line
    carrying a verse number is never taller than its neighbours. The numeral is
    joined to its first word with a **no-break space** (prose mode used to strand
    numbers at the end of a line at larger sizes) and sits OUTSIDE the highlight
    run, because an inline view takes no text background and would otherwise
    punch a hole in the tint.
  - **Swipe between chapters** is `src/components/reader/ChapterSwipe.tsx`
    (Reanimated + RNGH), modelled on the Bible app's reader: the page **tracks
    the finger**, a chevron pill slides in from the edge you pull away from and
    **illuminates** (accent fill) once the commit threshold is crossed, crossing
    it fires **one** light haptic (re-arming if you drag back under), and release
    past it carries the page off and commits — short of it, it springs back. At
    the first/last reading the drag rubber-bands against a short stop with no
    pill and no haptic. The neighbouring chapter is not rendered during the drag;
    the commit plays as carry-off → new content in from the opposite edge, and
    that entrance is replayed for **every** content change (`contentKey`), which
    is what makes chip taps and translation switches fade too. The pills are
    geometric, not semantic — the right-edge pill always carries
    `chevron.right`, which reads as forward in LTR and back in RTL — and they
    are decorative (`pointerEvents="none"`, hidden from assistive tech): the
    chapter chips above the reading are the accessible navigation.
    - **The drag math is `src/lib/readerSwipe.ts`** — threshold, over-drag
      slowing, the end-of-list rubber band, flick-to-commit — pure worklets, so
      the *feel* is unit-tested with `npm run test`. Tune the numbers there, not
      in the component; the component keeps only animation timings. Don't wrap
      the pills in `GlassSurface`: their opacity animates to 0, which the glass
      material can't survive (see the note under Primitives).
    - `DailyWordScreen` prefetches the chapters on either side of the current
      one so a committed swipe lands on text, not a spinner (`prefetchToday`
      only warms today in the *default* translation).
- **Offline downloads** (`src/lib/downloads/`, reached from Settings →
  `OfflineDownloadsScreen`) let users save a **whole Bible translation** for
  offline reading — every chapter is enumerated up front from core's
  `BOOK_CHAPTER_COUNTS` (`packages/core/src/bible/chapterCounts.ts`), fetched from
  R2, and written as on-device blobs (`expo-file-system`). The pure logic
  (`downloader`, `manifest`, `resolver`, `staleness`) is **dependency-injected**
  so it unit-tests headless with `memoryBlobStore`; `service.ts` wires the real
  `expoBlobStore` + `fetch` + `expo-network`. State lives in a manifest
  (`gc.downloads.v1`, same injected-storage/`useSyncExternalStore` pattern as
  `defaults.ts`): completed downloads keyed by translation id + a **"Wi-Fi only"**
  preference (enforced via `expo-network`, raising `WifiRequiredError`). Downloads
  report progress, can be cancelled (`AbortToken`), retry transient failures with
  backoff, and are **local-only** to delete (never touches Supabase). `getPassage`
  in `bibleSource.ts` reads a downloaded chapter before falling back to R2.
  Staleness compares the stored translations `version` against the live manifest.
  Its footer copy covers translations only — do NOT re-add the design
  reference's "daily devotionals from The Gospel Coalition stream over the
  network" sentence (`[UI] Offline Downloads.dc.html` still carries it): that
  devotional feed was dropped and never shipped, so the line described a
  feature users can't find.

## Internationalization (i18n)

Mirrors the web app's setup (`apps/web/src/i18n`) so the shared `gracechords-i18n`
tooling serves both. **`i18next` + `react-i18next`** (same versions as web) plus
**`expo-localization`** for the device locale; all pure JS, so the same locale
JSONs serve iOS now and Android later — no native `.strings`.

- Locale files: `src/i18n/locales/{en,tr}/<ns>.json`. **`en/` is the source of
  truth**; each file opens with a single-line `_meta` block, camelCase keys,
  `{{var}}` interpolation, and i18next `_one`/`_other` plural keys. `tr/` mirrors
  `en/` exactly (English placeholder values until translated). Namespaces:
  `common, nav, home, auth, song, setlist, export, settings, reader, offline,
  utilities, errors`.
- Runtime: `src/i18n/` — `resources.ts` builds the resource map + `SUPPORTED_LOCALES`
  from the locale folders via `require.context` (folders are the source of truth,
  **don't hardcode a locale list**); `config.ts` holds `resolveLanguage` (stored
  pick → device locale → English) and the native-name labels; `index.ts` inits
  i18next (`fallbackLng:'en'`, `defaultNS:'common'`) and exports
  `applyLanguagePreference`.
- Consume via `useTranslation('ns')` → `t('key')` (or `t('ns:key')` across
  namespaces). RN-free `src/lib` modules stay pure by returning locale KEYS or
  taking an injected translator (`greetings.ts`, `authValidation.ts`,
  `authFlows.ts`, `setlistImport.ts`, `relativeTime.ts`, `capo.ts`).
- **App language** persists in `defaults.ts` (`gc.defaults.language`, `null` =
  follow device), applied during the splash hold. **Bible translation** persists
  separately in `bibleTranslationPref.ts` (`gc.bible.translation.v1`) and is
  INDEPENDENT of UI language: a stored pick always wins; with none,
  `defaultTranslationForLocale` seeds the first manifest translation matching the
  app locale, else ESV.
- Adding a language: create `src/i18n/locales/<code>/` mirroring `en/`, add a
  label in `config.ts`, run `npm run i18n:check` (parity gate, mirrors web's).
  Adding/renaming a key: change it in `en/` AND `tr/` together. Never translate
  the brand "GraceChords".

## Out of scope (for now)

The whole-set **Charts ZIP / ChordPro** export backends (whole-set PDF ships via
`/api/export/setlist`; the ZIP/ChordPro tiles render disabled), **offline
downloads for songs** (Bible-translation downloads ship — see the downloads
module above — but on-device song/setlist persistence does not), the Song Library
**"Add song"** button (a no-op), **password reset / email-confirmation** screens (the login "Forgot?"
link is an informational alert only), tablet master-detail, GraceTracks, and
migrating web's `features/readings` onto core's `bible` module.

**No longer out of scope:** EAS Build ships iOS today (`eas.json` carries a live
`submit.production.ios`), and **Android is a real target** — see the MD3 section
at the top, the Android config in `app.json`, and the Android release commands
above. The one Android prerequisite that is still on you is the **Android-type
OAuth client** (package + signing SHA-1); that requirement is documented in full
in the auth section, not repeated here.
