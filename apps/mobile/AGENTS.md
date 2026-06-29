# @gracechords/mobile — Agent Guidance

Mobile sub-doc. The repo-root [`AGENTS.md`](../../AGENTS.md) is the single source
of truth for monorepo-wide conventions (shared core, RBAC, Supabase, commit
style). This file covers only what is **specific to the Expo app**. Read the root
doc first.

## What this is

A native (Expo / React Native) client for GraceChords, scaffolded as a thin
vertical slice that proves the shared `@gracechords/core` package and Supabase
auth run on-device. It is intentionally minimal — **not** the real/native UI.

## Stack

- **Expo SDK 55** (pinned — not 54, not 56). Bump deliberately with
  `npx expo install expo@<sdk> --fix`, never by hand.
- **Expo Router v7** (`expo-router@~55.0.16`) — file-based routing under `app/`.
- **TypeScript**, React 19.2 / React Native 0.83.
- **Continuous Native Generation (CNG).** `ios/` and `android/` are **gitignored
  and never committed** — regenerate them with `npx expo prebuild`. Treat
  `app.json` (+ config plugins) as the source of truth for native config.

## Commands (run from `apps/mobile/`)

- `npx expo run:ios` — prebuild + build + launch on the iOS simulator (needs
  macOS + Xcode).
- `npm run start` — Metro dev server.
- `npm run export:ios` — `expo export --platform ios`; a Metro-only bundle that
  works on any OS. Use it to verify resolution/transpile without a simulator.
- `npm run typecheck` — `tsc --noEmit`.

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

## Out of scope (this slice)

Reimagined native UI, tablet master-detail, Google OAuth (see the `TODO: OAuth`
in `src/screens/LoginScreen.tsx`), EAS Build / TestFlight, Android, GraceTracks.
