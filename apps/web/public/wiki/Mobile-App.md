The GraceChords native iOS app — an Expo / React Native client that shares the
same `@gracechords/core` logic and Supabase backend as the web app.

## What it is today
Built from the `gc-ios-design-reference/` design bundle, the app currently ships:
- a themed **four-tab shell** (Home · Songs · Setlists · Daily Word),
- the **Song Library** and **Home** screens,
- a placeholder **Song Viewer** route, and
- an **authenticated-only** route gate (redirects to login when signed out).

It's a real, growing native client — not just a scaffold — but several screens
are still placeholders (see [Roadmap](#roadmap)).

## Stack
- **Expo SDK 55**, **Expo Router v7**, TypeScript, React Native 0.83.
- **Theme:** the typed token map from `@gracechords/tokens/native` (iOS light/dark palette), consumed via `useTheme()`. Icons are **SF Symbols only** (iOS/iPadOS).
- **Native dirs** (`ios/`, `android/`) use Continuous Native Generation — gitignored, regenerated via `npx expo prebuild`. `app.json` is the source of truth for native config.
- **Auth/data:** Supabase via core's `createGcSupabase` factory; the public anon key, stored with AsyncStorage; token refresh driven by `AppState`.

## Running it
Requires macOS + Xcode for the simulator:
```bash
cd apps/mobile
cp .env.example .env        # public Supabase URL + anon key
npx expo run:ios
```
Without a Mac, verify the JS bundle on any OS with `npm run export:ios` and
`npm run typecheck`.

## Roadmap
- The real **Song Viewer** (chord chart rendering)
- **Setlists** and **Daily Word / Reader** screens (placeholders today)
- On-device **history / setlist storage** and star writes
- Auth screen redesign / **Google OAuth**
- **Tablet** master-detail layout
- **EAS Build / TestFlight** distribution, then **Android**
- **GraceTracks** practice-stem integration

## For developers
Conventions (theme, primitives, SF Symbols, auth gating, Metro monorepo
resolution, Supabase wiring) live in `apps/mobile/AGENTS.md`. Shared logic must be
added to `@gracechords/core` as additive exports — never duplicated in the app.

[[Project-Structure]] [[Roles-and-Access]] [[Getting-Started]]
