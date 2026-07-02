# @gracechords/mobile

The GraceChords native iOS app — Expo (React Native) — consuming the shared
`@gracechords/core` package and Supabase auth on-device.

This is one workspace in the GraceChords monorepo. See the
[root README](../../README.md) for the project overview, and
[`AGENTS.md`](./AGENTS.md) in this directory for the full set of mobile
conventions (theme/primitives, SF Symbols, auth gating, Metro resolution).

## What it is today

A real, feature-complete-enough-to-use native client, built from the
[`gc-ios-design-reference/`](../../gc-ios-design-reference/) design bundle. The
core worship-team flows all ship:

- a themed **four-tab shell** — Home · Songs · Setlists · Daily Word,
- a **Song Viewer** with a real chord chart: live transpose, key change,
  sharp/flat accidentals toggle, view options (chords/lyrics, section labels,
  font scale, letters/solfège), favorite star, and export/share,
- a **Performer** (setlist play-through) screen — the native worship-mode analog,
- **Setlists**: list, builder with debounced autosave and drag reorder,
  swipe-to-delete, per-song key overrides, sharing, and whole-set PDF export,
- a **Daily Word / Reader** — the M'Cheyne daily plan with translation picker,
  reader settings, day-scoped highlight persistence, and **offline downloads**
  (save a whole Bible translation to the device; the reader reads it offline-first),
- **auth** with email/password plus native **Google** and **Apple** sign-in, a
  post-signup sprite avatar picker, and an **authenticated-only** route gate,
- a grouped **Settings** screen with app-wide theme and chord-style defaults, an
  **About** screen, sign-out, and account deletion.

A few things are still stubs or later stages — see [Roadmap](#roadmap).

- **Stack:** Expo SDK 55, Expo Router v7, TypeScript, React 19.2 / React Native 0.83.
- **Native dirs:** `ios/` and `android/` use Continuous Native Generation — they are gitignored and regenerated via `npx expo prebuild`. Never commit them; treat `app.json` (+ config plugins) as the source of truth for native config.
- **Theme:** the typed token map from `@gracechords/tokens/native` (iOS light/dark palette), consumed via `useTheme()`. Icons are **SF Symbols only**.
- **Backends:** Supabase (auth, stars, setlists) via core's `createGcSupabase`; the web app's Pages Functions for song/setlist **export** and **Telegram** push; Cloudflare R2 for **Daily Word** Bible JSON.

## Run it (macOS + Xcode required for the simulator)

```bash
cd apps/mobile
cp .env.example .env        # fill in the public Supabase URL + anon key (and more)
npx expo run:ios            # prebuild + build + launch on the iOS simulator
```

Without a Mac you can still verify the JS bundle (resolution + transpile of the
TS core) and the RN-free logic on any OS:

```bash
npm run export:ios          # expo export --platform ios (Metro only, no Xcode)
npm run typecheck           # tsc --noEmit
npm run test                # vitest over src/lib logic (auth, defaults, profile)
npm run start               # Metro dev server
```

### Environment

All app config comes from `apps/mobile/.env` (see `.env.example` for the full,
annotated list). The Supabase vars use the **public anon** key — the same one
the web client uses, never the service-role key. Mirror any new `EXPO_PUBLIC_*`
var into `.env.example` in the same commit.

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — auth + data.
- `EXPO_PUBLIC_API_BASE_URL` — deployed web app; mobile calls its Pages
  Functions for export (`/api/export/song`, `/api/export/setlist`) and Telegram
  push (`/api/telegram/push`). Use the canonical (non-redirecting) domain.
- `EXPO_PUBLIC_R2_PUBLIC_URL` — Cloudflare R2 base for Daily Word Bible JSON
  (defaults to `https://assets.gracechords.com`).
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` —
  native Google Sign-In (the reversed iOS client id also goes in `app.json`).

## Roadmap

Not yet in the build, in rough priority order:

- **Offline downloads for songs/setlists** — on-device persistence beyond Bible
  translations (Daily Word translation downloads already ship).
- **Password reset / email-confirmation** screens (login "Forgot?" is an alert).
- **Tablet** master-detail layout.
- **EAS Build / TestFlight** distribution.
- **Android** — auth code is cross-platform-safe, but Android OAuth config
  (SHA-1, `google-services`) is not set up.
- **GraceTracks** practice-stem integration.

See [`AGENTS.md`](./AGENTS.md) for the conventions that keep new screens
consistent with the theme, primitives, and shared core.
