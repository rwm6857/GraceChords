# @gracechords/mobile

The GraceChords native iOS app — Expo (React Native) — consuming the shared
`@gracechords/core` package and Supabase auth on-device.

This is one workspace in the GraceChords monorepo. See the
[root README](../../README.md) for the project overview, and
[`AGENTS.md`](./AGENTS.md) in this directory for the full set of mobile
conventions (theme/primitives, SF Symbols, auth gating, Metro resolution).

## What it is today

A real (if still-growing) native client, built from the
[`gc-ios-design-reference/`](../../gc-ios-design-reference/) design bundle:

- a themed **four-tab shell** (Home · Songs · Setlists · Daily Word),
- the **Song Library** and **Home** screens,
- a placeholder **Song Viewer** route, and
- an **authenticated-only** route gate (redirects to login when signed out).

More screens are in progress — see [Roadmap](#roadmap) below.

- **Stack:** Expo SDK 55, Expo Router v7, TypeScript, React 19.2 / React Native 0.83.
- **Native dirs:** `ios/` and `android/` use Continuous Native Generation — they are gitignored and regenerated via `npx expo prebuild`. Never commit them; treat `app.json` as the source of truth for native config.
- **Theme:** the typed token map from `@gracechords/tokens/native` (iOS light/dark palette), consumed via `useTheme()`.

## Run it (macOS + Xcode required for the simulator)

```bash
cd apps/mobile
cp .env.example .env        # fill in the public Supabase URL + anon key
npx expo run:ios            # prebuild + build + launch on the iOS simulator
```

Without a Mac you can still verify the JS bundle (resolution + transpile of the
TS core) on any OS:

```bash
npm run export:ios          # expo export --platform ios (Metro only, no Xcode)
npm run typecheck           # tsc --noEmit
npm run start               # Metro dev server
```

Env vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) use the
**public anon** key — the same one the web client uses, never the service-role
key. Mirror any new `EXPO_PUBLIC_*` var into `.env.example`.

## Roadmap

Out of scope in the current build, in rough priority order:

- The real **Song Viewer** (chord chart rendering).
- The **Setlists** and **Daily Word / Reader** screens (placeholders today).
- On-device **history / setlist storage** and star writes (reads are wired; `src/lib/recents.ts` is stubbed).
- Auth screen redesign / **Google OAuth** (see `TODO: OAuth` in `src/screens/LoginScreen.tsx`).
- **Tablet** master-detail layout.
- **EAS Build / TestFlight** distribution.
- **Android** support.
- **GraceTracks** practice-stem integration.

See [`AGENTS.md`](./AGENTS.md) for the conventions that keep new screens
consistent with the theme, primitives, and shared core.
