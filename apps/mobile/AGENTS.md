# @gracechords/mobile — Agent Guidance

Mobile sub-doc. The repo-root [`AGENTS.md`](../../AGENTS.md) is the single source
of truth for monorepo-wide conventions (shared core, RBAC, Supabase, commit
style). This file covers only what is **specific to the Expo app**. Read the root
doc first.

## What this is

A native (Expo / React Native) client for GraceChords. It carries real UI built
from the design reference: a themed four-tab shell, the **Song Library** and
**Home** screens, a placeholder **Song Viewer** route, and an
**authenticated-only** route gate. Build new screens on the shared theme +
primitives below — don't add one-off styles or hardcoded colors where a
primitive/token fits.

Design source: `gc-ios-design-reference/` (repo root). Follow its
non-negotiables — HIG/UIKit over the mockups, **SF Symbols only**, and translate
the visual rather than porting the HTML/CSS.

## Stack

- **Expo SDK 55** (pinned — not 54, not 56). Bump deliberately with
  `npx expo install expo@<sdk> --fix`, never by hand.
- **Expo Router v7** (`expo-router@~55.0.16`) — file-based routing under `app/`.
- **TypeScript**, React 19.2 / React Native 0.83.
- **Continuous Native Generation (CNG).** `ios/` and `android/` are **gitignored
  and never committed** — regenerate them with `npx expo prebuild`. Treat
  `app.json` (+ config plugins) as the source of truth for native config.
- **UI deps:** `expo-symbols` (SF Symbols), `expo-linear-gradient` (the Home
  hero), `expo-splash-screen` (auth-gate hold). Add Expo deps with
  `npx expo install <pkg>`; if the Expo API is unreachable, pin the SDK-correct
  version from `node_modules/expo/bundledNativeModules.json` and `npm install`.

## Commands (run from `apps/mobile/`)

- `npx expo run:ios` — prebuild + build + launch on the iOS simulator (needs
  macOS + Xcode).
- `npm run start` — Metro dev server.
- `npm run export:ios` — `expo export --platform ios`; a Metro-only bundle that
  works on any OS. Use it to verify resolution/transpile without a simulator.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` — vitest (node env) over the RN-free logic in `src/lib`
  (auth flows, validation, sprite persistence). Native modules are injected
  deps, never `vi.mock`ed.

## Metro monorepo resolution (load-bearing)

`@gracechords/core` is consumed as **TypeScript source with no build step** (its
`main` is `src/index.ts`). `metro.config.js` therefore:

1. adds the repo root to `watchFolders`, and
2. lists both `apps/mobile/node_modules` and the hoisted root `node_modules` in
   `resolver.nodeModulesPaths`.

Metro transpiles core's `.ts` through `babel-preset-expo`. Do **not** add a build
step to core to make mobile work — fix Metro config instead.

## Supabase

- Wired through core's `createGcSupabase({ url, anonKey, storage, auth })` —
  **never** call `createClient` directly here.
- Storage adapter is `@react-native-async-storage/async-storage`;
  `detectSessionInUrl` is forced `false` (no URL redirect on native);
  `persistSession`/`autoRefreshToken` keep the factory defaults (`true`).
- Token refresh is driven by `AppState` (`registerAuthAutoRefresh` in
  `src/lib/supabase.ts`), called once at the app root.
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
  `ListRow`, `Chip`, `SectionHeader`. Prefer them over bespoke views.
- **Icons are SF Symbols only**, via `src/components/SymbolIcon.tsx` (wraps
  `expo-symbols`) — no hand-drawn/SVG glyphs. SF Symbols render on iOS/iPadOS only
  (the current target).
- Gradients use `expo-linear-gradient` with tokens from `native.ts`
  (`heroGradient`/`heroGlow`). The atmospheric Home hero is the **only** sanctioned
  gradient — never a UI-surface gradient. (RN has no radial gradient; the hero
  approximates it with a linear gradient + a soft glow overlay.)
- Screens live in `src/screens/`; route files under `app/` are thin wrappers that
  render them.

## Routing, screens & auth

- `app/(tabs)/_layout.tsx` — the four-tab shell (Home · Songs · Setlists · Daily
  Word), `headerShown:false` (screens draw their own large-title headers).
- `app/viewer/[slug].tsx` — Song Viewer, **outside** the tab group (pushes over the
  shell); currently a placeholder. `app/login.tsx` — the auth screen (sign in +
  sign up modes in `src/screens/AuthScreen.tsx`); `app/choose-icon.tsx` — the
  post-signup sprite avatar picker.
- **Authenticated-only.** `app/_layout.tsx` gates every route on the Supabase
  session (redirect to `/login` when signed out, into the tabs when signed in) and
  holds the native splash (`expo-splash-screen`) until the session resolves *and*
  the correct screen is mounted, so nothing flashes on first open. Session persists
  via AsyncStorage until uninstall — don't add proactive sign-outs. Exception:
  `choose-icon` is reachable both with and without a session (post-signup step —
  email confirmation may still be pending).
- **Auth flows.** Email/password plus native Google
  (`@react-native-google-signin/google-signin`) and Apple
  (`expo-apple-authentication`, iOS-only button) via
  `supabase.auth.signInWithIdToken`. The orchestration lives in
  `src/lib/authFlows.ts` as dependency-injected, RN-free functions (tested with
  vitest — `npm run test`); the only native-importing glue is
  `src/lib/authDeps.ts`. Google client ids come from
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and the
  reversed iOS client id must be set in `app.json` → google-signin plugin
  `iosUrlScheme`. The sprite pick is written to `users.preferences.sprite`
  (`src/lib/profile.ts`) — the same JSONB shape the web Profile page writes; ids in
  `src/lib/sprites.ts` must stay in sync with web's `SpritePicker.jsx`.

## Data & stubs

- Song data uses core's `fetchSongList` (widen columns via its `opts.columns`);
  screen data hooks live in `src/lib/` (`useSongList`, `useStarredSongs`).
- **Stars** are per-user Supabase data — table `user_starred_songs` (`song_id` is a
  uuid FK to `songs.id`, RLS-scoped to `auth.uid()`). `useStarredSongs` reads them
  via an inline joined query (read-only for now; starring/unstarring is later). This
  inline query is the **one sanctioned exception** to "queries live in core" — kept
  in mobile to avoid a core change; promote it to core when stars grow.
- **Setlists are per-user Supabase data** — tables `setlists` / `setlist_songs`
  (per-entry key override in `setlist_songs.key_override`, exposed app-side as
  `toKey`). Queries live in core's `setlistsRepo` (injected client); mobile hooks
  are `useSetlists`, `useSetlistBuilder` (debounced wipe-and-replace autosave),
  and `useLastSet` (Home's "Last set" card).
- **Local history is stubbed.** `src/lib/recents.ts` (`getRecentlyOpened`) returns
  empty and will be backed by an on-device history of opened songs — the Viewer
  should record opens when that layer ships; consume the stub, don't mock data.
  Editable greeting phrases live in `src/lib/greetings.ts` (`SUB_GREETINGS`).
- **Daily Word / Reader** reads the day's M'Cheyne passages from Cloudflare R2.
  Shared, DOM-free logic (plan lookup, reading expansion, translation manifest,
  RTL, chapter/copy helpers) lives in core's `bible` module (`@gracechords/core`),
  base-URL injected. `src/lib/bibleSource.ts` is the **single source seam**
  (`getPassage`/`getTranslations`) that reads R2 now via `EXPO_PUBLIC_R2_PUBLIC_URL`
  (default `https://assets.gracechords.com`); a local offline-download source is
  meant to slot in behind it later (branch stubbed, not wired). Hooks:
  `useBibleTranslations`, `usePassageChapter` (`src/lib/useReader.ts`). Reader
  settings (size/typeface/layout/spacing) are **session-ephemeral** — not tied to
  Settings, so they reset on relaunch. **Follow-up:** `apps/web`'s
  `features/readings` + `utils/bible` still hold their own copy of this logic;
  migrate web onto core's `bible` module to remove the duplication.

## Out of scope (for now)

The whole-set Charts ZIP / ChordPro export backends (whole-set PDF ships via
`/api/export/setlist`), the Daily Word **landing page** and **offline
translation download / file management** (the Reader itself ships; downloads are
a later stage), the on-device history layer + star writes,
password reset / email-confirmation screens (the login "Forgot?" link is an
informational alert only), tablet master-detail, EAS Build / TestFlight,
Android (auth code is cross-platform-safe, but Android OAuth config — SHA-1,
google-services — is not set up), GraceTracks.
