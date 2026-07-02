The GraceChords native iOS app — an Expo / React Native client that shares the
same `@gracechords/core` logic and Supabase backend as the web app.

## What it is today
Built from the `gc-ios-design-reference/` design bundle, the app now covers the
core worship-team flows end to end:
- a themed **four-tab shell** — Home · Songs · Setlists · Daily Word,
- a **Song Viewer** with a real chord chart — live transpose, key change,
  sharp/flat accidentals, view options (chords/lyrics, section labels, font
  scale, letters/solfège), a favorite star, and PDF/JPG export + share,
- a **Performer** screen that runs a setlist one song at a time (swipe, progress
  rail, per-song key),
- **Setlists** — a builder with debounced autosave, drag reorder,
  swipe-to-delete, per-song key overrides, sharing, and whole-set PDF export,
- a **Daily Word / Reader** — the M'Cheyne daily plan with a translation picker,
  reader settings, and highlights that persist for the day,
- **auth** with email/password plus native **Google** and **Apple** sign-in, a
  post-signup **sprite avatar** picker, and an **authenticated-only** route gate,
- a grouped **Settings** screen with app-wide theme and chord-style defaults, an
  **About** screen, sign-out, and account deletion.

A few pieces are still stubs or later stages (see [Roadmap](#roadmap)).

## Stack
- **Expo SDK 55**, **Expo Router v7**, TypeScript, React Native 0.83.
- **Theme:** the typed token map from `@gracechords/tokens/native` (iOS light/dark palette), consumed via `useTheme()`. Icons are **SF Symbols only** (iOS/iPadOS).
- **Native dirs** (`ios/`, `android/`) use Continuous Native Generation — gitignored, regenerated via `npx expo prebuild`. `app.json` is the source of truth for native config.
- **Backends:** Supabase (auth, stars, setlists) via core's `createGcSupabase` factory — the public anon key, stored with AsyncStorage, token refresh driven by `AppState`; the web app's **Pages Functions** for song/setlist export and Telegram push; Cloudflare **R2** for Daily Word Bible JSON.

## Running it
Requires macOS + Xcode for the simulator:
```bash
cd apps/mobile
cp .env.example .env        # public Supabase URL + anon key, API base, Google client ids
npx expo run:ios
```
Without a Mac, verify the JS bundle and RN-free logic on any OS with
`npm run export:ios`, `npm run typecheck`, and `npm run test`.

## Roadmap
- **Offline downloads** — on-device song/reading persistence and file management (the screen is scaffolded; the Reader currently needs network).
- On-device **history** — Home's "Continue where you left off" card.
- **Password reset / email-confirmation** screens.
- **Tablet** master-detail layout.
- **EAS Build / TestFlight** distribution, then **Android** (Android OAuth config is not set up yet).
- **GraceTracks** practice-stem integration.

## For developers
Conventions (theme, primitives, SF Symbols, auth gating, Metro monorepo
resolution, Supabase wiring, export/Telegram, defaults) live in
`apps/mobile/AGENTS.md`. Shared logic must be added to `@gracechords/core` as
additive exports — never duplicated in the app.

[[Project-Structure]] [[Roles-and-Access]] [[Getting-Started]]
