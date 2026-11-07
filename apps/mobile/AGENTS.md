# @gracechords/mobile — Agent Rules

Expo-specific rules; monorepo-wide rules (core, tokens, roles, RLS, migrations,
env vars, commits) are in the root [`AGENTS.md`](../../AGENTS.md). Paths are
relative to `apps/mobile/`.

The native GraceChords client for **iOS and Android**: five tabs (Home · Songs ·
Setlists · Daily Word · Utilities), Song Viewer, Performer, Setlist Builder, song
editor, live sessions, Daily Word reader, and native Google/Apple auth — all behind
an authenticated-only route gate.

## Feature docs — read before changing these areas
| Area | Doc |
|---|---|
| Song Viewer, Performer, live-session follower, export, Home/tablet layouts, intro, Settings, Daily Word landing, devotionals, reflections | [`src/screens/README.md`](src/screens/README.md) |
| Device-local stores, Daily Word reminder, live-session store, in-app review, auth flows & Google/Apple setup | [`src/lib/README.md`](src/lib/README.md) |
| Key Reference dial | [`src/lib/keyref/README.md`](src/lib/keyref/README.md) |
| Daily Word reader (verse numerals, chapter swipe, scroll, settings) | [`src/components/reader/README.md`](src/components/reader/README.md) |
| Offline Bible downloads | [`src/lib/downloads/README.md`](src/lib/downloads/README.md) |
| Releases, versioning, Android R8 | [`RELEASING.md`](RELEASING.md) |
| Image assets, sprites | [`assets/README.md`](assets/README.md) |
| Deep-link claim table | [`../web/public/.well-known/README.md`](../web/public/.well-known/README.md) |

## Design authority
- **iOS follows Apple's HIG; Android follows Material Design 3.** Where they
  disagree on Android, MD3 wins — prefer native components (NativeTabs' Material
  navigation bar, native `formSheet`/bottom sheet) over hand-rolled ones. Settled
  cross-platform decisions still hold: phone layouts stay as designed, and sheets
  use `formSheet`, not popovers.
- **Native icons only** — SF Symbols on iOS, Material Symbols on Android. Never
  hand-drawn or SVG.

## Stack
- **Expo SDK 55, pinned.** Bump only with `npx expo install expo@<sdk> --fix`.
  Expo Router v7, TypeScript, React 19.2, React Native 0.83.
- **CNG:** `ios/` and `android/` are gitignored and never committed (`npx expo prebuild`
  regenerates them). `app.json` + config plugins (`plugins/`) are the source of
  truth for native config.
- Add deps with `npx expo install <pkg>`. If the Expo API is unreachable, pin the
  version from `node_modules/expo/bundledNativeModules.json` and `npm install`.
- `@react-native-community/datetimepicker` is pinned **exactly** at the SDK version (`8.6.0`).
- `expo-image` is the **only** component allowed to render the sprite and mark
  assets (RN `Image` decodes WebP on Android only).
- **`react-native-svg` is not installed and not needed** — don't add it.
- `expo-build-properties` sets `ios.useFrameworks: "static"` (required by
  google-signin) and Android R8 minification (see `RELEASING.md`).

## Commands
- `npm run start` — Metro. `npx expo run:ios` / `run:android` — build + launch
  (iOS needs macOS + Xcode). Physical iOS device: `npx expo run:ios --device`
  (dev client; phone and Mac on the same non-guest Wi-Fi, no VPN).
- `npm run typecheck` · `npm run test` (vitest over RN-free `src/lib`) · `npm run i18n:check`
- `npm run export:ios` and `export:android` — Metro-only bundles that work on any
  OS. **Run both after touching anything shared.**
- **Before pushing:** typecheck, test, i18n:check, and both exports pass.
- Tests inject native modules as dependencies; never `vi.mock` them.

## Metro & expo-doctor
- `@gracechords/core` is consumed as TS source; `metro.config.js` is exactly
  `getDefaultConfig(__dirname)` and must stay override-free. Never add a build step
  to core to make mobile work.
- `expo-doctor` has **three expected failures** — confirm they are still these,
  and don't "fix" them:
  1. **Duplicate `react`** — npm hoists web's React 18 to the root; Expo CLI's
     sticky resolution still bundles exactly one React (mobile's 19).
  2. **`app.json` schema rejects `newArchEnabled`** — keep it: prebuild still reads
     it, and deleting it drops `RCTNewArchEnabled` from the iOS `Info.plist`.
  3. **Patch drift within SDK 55** — align with `npx expo install --fix` in its own
     commit, never inside a release commit.

## Supabase & data
- Client: `src/lib/supabase.ts` via core's `createGcSupabase` — never `createClient`.
  AsyncStorage adapter, `detectSessionInUrl: false`, refresh driven by `AppState`
  (`registerAuthAutoRefresh`).
- Env: `EXPO_PUBLIC_*` in `.env` (anon key only); mirror new vars into `.env.example`.
- Queries live in core (e.g. `fetchSongList`, `setlistsRepo`, `reflectionsRepo`).
  **The sanctioned exceptions** are the stars queries in `useStarredSongs` /
  `useSongStar` (`user_starred_songs`) — promote them to core if stars grow — and
  the own-row `users` reads/writes (`role` in `useSetlists.ts`, `preferences.sprite`
  in `profile.ts`, plus the `delete_user` RPC in `AccountScreen`).
- **Device-local state** (preferences, recents, streak, etc.) follows the
  `defaults.ts` pattern: injected `KVStorage`, hydrated at splash via
  `LAUNCH_STORAGE_KEYS`, then synchronous reads + `useSyncExternalStore`. New
  pure logic goes in `src/lib` as RN-free, dependency-injected, unit-tested code.
- Reflections are **private-only**. Don't build public user content without
  reopening App Store Guideline 1.2 (see `../web/functions/api/reflections/README.md`).

## Theme & UI
- Tokens come from `@gracechords/tokens/native` via `useTheme()`
  (`t.colors`, `t.spacing`, `t.radii`, `t.typography`, `t.layout`). **Never
  hardcode hex values**; new shared values go in `packages/tokens/native.ts`. Light
  and dark must both look right.
- Primitives in `src/components/`: `Screen`, `Button`, `Card`, `ListRow`, `Chip`,
  `SectionHeader`, `ConstrainedContent`, `GlassSurface`, `SymbolIcon`, etc. Prefer
  them over bespoke views.
- Tablet: wrap content in `ConstrainedContent` (`tier="form"` / `"content"` /
  `"dashboard"`); it is a pass-through on phones. Tablet layouts never change phone layouts.
- Screens live in `src/screens/`; route files in `app/` are thin wrappers.
- **Sheets:** every sheet uses the native `formSheet` route (`app/sheet.tsx` +
  `src/lib/formSheetHost.ts`) via `useFormSheet` + `FormSheetShell`. The host pads
  the bottom safe-area inset (a `fitToContents` sheet would otherwise leave the
  home-indicator strip uncovered) — **sheet content must not add `insets.bottom`**;
  it would double the gap, or scroll away inside a `maxHeight` ScrollView.
- **Icons:** always `SymbolIcon` with an SF Symbol `name`. Android maps it through
  `SF_TO_MATERIAL` in `src/components/symbolMap.ts`. **For a new icon, add the
  mapping and run `python3 scripts/build-symbol-fonts.py`** (needs `fonttools`),
  then commit the two regenerated `.ttf` files. Use the `md` prop only to override
  an ambiguous mapping. Tab icons (`app/(tabs)/_layout.tsx`) set `sf`/`md` directly.
- **Gradients:** the hero band on Home and the Auth screen (`expo-linear-gradient`
  + `heroGradient`/`heroGlow` tokens) is the only sanctioned gradient — never on
  UI surfaces.

## Routing & auth gate
- `app/_layout.tsx` gates every route on the Supabase session (signed out →
  `/login`) and holds the native splash until the right screen mounts, then hands
  off to `SplashOverlay`, which owns the only `hideAsync()` on the normal launch
  path. Sessions persist until uninstall — **don't add proactive sign-outs.**
- Public routes: `session/[code]` (anonymous follower) and `sheet` (the form-sheet
  host). The auth-flow routes (`login`, `forgot-password`, `auth-link`,
  `reset-password`, `choose-icon`) are also ungated; `choose-icon` works with or
  without a session.
- A deep link arriving while signed out is held in memory
  (`src/lib/pendingRoute.ts`) and resumed after sign-in or the post-signup
  avatar step.
- **Deep links:** add a claim in **three places at once** — the AASA file and
  `assetlinks.json` (`../web/public/.well-known/`, whose README holds the claim
  table), `app.json` (`ios.associatedDomains` / `android.intentFilters`), and
  `src/lib/deepLinks.ts` (+ a test). Enumerate paths; never wildcard the domain.
  Changing domains or `intentFilters` needs a fresh native build; a new iOS path is
  web-deploy only, but Android path changes need a rebuild.
- Auth setup pitfalls (Google `DEVELOPER_ERROR`, "Skip nonce checks", Android
  OAuth client): see `src/lib/README.md` → Auth.

## Internationalization
- `i18next` + `react-i18next` + `expo-localization`, mirroring web. Locales:
  `src/i18n/locales/{lang}/<namespace>.json` (currently `en`, `es`, `ko`, `tr`).
  **`en/` is the source of truth**; locale folders are discovered by
  `require.context` — **don't hardcode a locale list**.
- Adding or renaming a key: change it in **every** locale folder, then run
  `npm run i18n:check`. Never translate "GraceChords". Each file opens with a
  single-line `_meta` block; plurals use `_one`/`_other`. Follow the web `_meta`
  review rules (`../web/AGENTS.md` → Internationalization) and use the
  `gracechords-i18n` skill for translations.
- Adding a language: create `src/i18n/locales/<code>/` mirroring `en/`, add its
  label in `src/i18n/config.ts`, run `npm run i18n:check`.
- RN-free `src/lib` modules return locale **keys** or take an injected translator.
- App language (`defaults.ts`, `null` = device) and Bible translation
  (`bibleTranslationPref.ts`) are independent preferences.

## Not built
GraceTracks, offline song/setlist downloads, ChordPro export (dropped by design),
and moving web's `features/readings` onto core's `bible` module (web still
duplicates that logic).
