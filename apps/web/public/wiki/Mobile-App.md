The GraceChords native iOS and Android app — an Expo / React Native client that shares the
same `@gracechords/core` logic and Supabase backend as the web app.

## What it is today
The app covers the core worship-team flows end to end:
- a themed **five-tab shell** — Home · Songs · Setlists · Daily Word · Utilities
  (tuner, metronome, pitch pipe, songbook, capo, key reference),
- a **Song Viewer** with a real chord chart — live transpose, key change,
  sharp/flat accidentals, view options (chords/lyrics, section labels, font
  scale, letters/solfège), a favorite star, and PDF/JPG export + share,
- a **Performer** screen that runs a setlist one song at a time (swipe, progress
  rail, per-song key),
- **Setlists** — a builder with debounced autosave, drag reorder,
  swipe-to-delete, per-song key overrides, sharing, import, and whole-set PDF export,
- a **song editor**, **live sessions** (a leader drives the set; followers join
  anonymously by code), and **Setlist Stats**,
- a **Daily Word** landing with devotionals, private (editable) journal
  reflections and an opt-in reading streak, leading to the **Reader** — the
  M'Cheyne daily plan with a translation picker, reader settings, highlights that
  persist for the day, and **offline downloads** (save a whole Bible translation
  to the device; the reader reads it offline-first),
- **auth** with email/password plus native **Google** and **Apple** sign-in, a
  post-signup **sprite avatar** picker, and an **authenticated-only** route gate,
- a grouped **Settings** screen with app-wide theme and chord-style defaults, an
  **About** screen, sign-out, and account deletion.

A few pieces are later stages (see [Roadmap](#roadmap)). ChordPro export is
not offered, by design.

## Stack
- **Expo SDK 55**, **Expo Router v7**, TypeScript, React Native 0.83.
- **Theme:** the typed token map from `@gracechords/tokens/native` (light/dark palette), consumed via `useTheme()`. Icons are native only: **SF Symbols** on iOS, **Material Symbols** on Android.
- **Native dirs** (`ios/`, `android/`) use Continuous Native Generation — gitignored, regenerated via `npx expo prebuild`. `app.json` is the source of truth for native config.
- **Backends:** Supabase (auth, stars, setlists, reflections, live sessions) via core's `createGcSupabase` factory — the public anon key, stored with AsyncStorage, token refresh driven by `AppState`; the web app's **Pages Functions** for song/setlist export and Telegram push; Cloudflare **R2** for Daily Word Bible JSON.

## Running it
iOS requires macOS + Xcode for the simulator:
```bash
cd apps/mobile
cp .env.example .env        # public Supabase URL + anon key, API base, Google client ids
npx expo run:ios            # or: npx expo run:android (device / emulator)
```
Without a Mac, verify the JS bundles and RN-free logic on any OS with
`npm run export:ios`, `npm run export:android`, `npm run typecheck`, and `npm run test`.

Store builds go through EAS Build (`npm run build:ios` / `build:android`); see
`apps/mobile/RELEASING.md`.

## Roadmap
- **Offline downloads for songs/setlists** — on-device persistence beyond Bible translations (Daily Word translation downloads already ship).
- **GraceTracks** practice-stem integration.

## For developers
Conventions (theme, primitives, native icons, auth gating, Metro monorepo
resolution, Supabase wiring, export/Telegram, defaults) live in
`apps/mobile/AGENTS.md`. Shared logic must be added to `@gracechords/core` as
additive exports — never duplicated in the app.

[[Project-Structure]] [[Roles-and-Access]] [[Getting-Started]]
