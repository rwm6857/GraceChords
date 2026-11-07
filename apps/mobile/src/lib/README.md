# `src/lib` — app logic

Most modules here are **RN-free and dependency-injected** (storage, clock,
network, native APIs passed in) so they unit-test headless with `npm run test`.
The native wiring lives in a sibling `*Service.ts`, `*Deps.ts`, or `use*.ts`.
Feature folders with their own README: `keyref/`, `downloads/`.

## Device-local stores
`defaults.ts` is the template: injected `KVStorage`, hydrated once during the
splash hold (keys listed in `launchStorage.ts` → `LAUNCH_STORAGE_KEYS`, read in
one `multiGet`), then a **synchronous** snapshot plus a `useSyncExternalStore`
hook. None of these sync to Supabase.

| Module | Key | Holds |
|---|---|---|
| `defaults.ts` | `gc.defaults.*` | theme, chord style, app language (`null` = device), `dailyWordDestination`, … |
| `recents.ts` | `gc.recents.songs.v1` | last 20 opened songs (deduped by slug), each with `lastKey` so Home reopens it in that key |
| `readingStreak.ts` | `gc.readingStreak.v1` | opt-in streak (default off; the intro presents it ON); a day counts when one of today's chapters renders |
| `readerReminder.ts` | `gc.readerReminder.v1` | Daily Word reminder (below) |
| `readerSettings.ts` | `gc.reader.settings.v1` | reader typography (see `components/reader/README.md`) |
| `introSeen.ts` | `gc.intro.seen.v1` | first-launch intro seen flag |
| `viewerPrefs.ts` | `gc.viewer.columns.v2` | global chart-column ceiling (1–3; migrates the old per-song `gc.viewer.columnMode.v1` once) |
| `autoHideChrome.ts` | `gc.viewer.autoHideChrome` | "hide controls when idle" (screen-scoped; not in `LAUNCH_STORAGE_KEYS`) |
| `reviewState.ts` | `gc.review.v1` | in-app review bookkeeping |

Viewer/Performer read the chord-style default on open; in-session changes don't
write back. Home's editable greeting phrases are the `subGreetings` array in
`src/i18n/locales/<lng>/home.json` (`greetings.ts` only picks an index).

## Daily Word reminder
Opt-in local notification via `expo-notifications`. Stored default is **off at
8:00** (`DEFAULT_READER_REMINDER`); the intro's card 3 presents it pre-toggled ON.
- `readerReminder.ts` — pure store, the injected `syncReminder()` reconciler,
  `formatReminderTime`, and `usesTwentyFourHourClock` (follows the **app
  language**, so picker and Settings row agree).
- `readerReminderService.ts` — permission request, one daily-repeating
  notification under a stable id, foreground handler, tap → `/daily`.
- Enabling requests permission and persists/schedules only on grant (steering to
  system Settings on denial). The root hydrates at splash and reconciles the OS
  schedule on launch.
- Time is set with the **platform's own picker** (`ReminderTimeSheet`) — never a
  hand-rolled stepper. iOS: spinner wheels inside the form sheet (`themeVariant`
  from the resolved theme), commits on **Done**. Android: native clock dialog via
  `DateTimePickerAndroid.open`, commits on OK. Its `design: 'material'` mode is
  deliberately unused (needs a `Theme.Material3.*` `styles.xml`, i.e. a config plugin).

## Live session (leader)
One **app-level store**, not per-screen state: `liveSession.ts` (pure, tested) +
`useLiveSession.ts` (Supabase-bound instance, hooks, shared share/end menu).
- Led from a **source**: a setlist (Performer) or a single catalog song (Song
  Viewer — a one-item snapshot, `i0`, indistinguishable to followers).
- The source attaches while mounted (`useLiveSessionSource`) and **detaches on
  unmount**, writing `current_item_uid = null`: followers see "Waiting for the
  leader…" and the session stays live. Leaving never ends it or prompts.
- The 60s heartbeat re-sends the whole position (nulls included).
- On relaunch `app/_layout.tsx` adopts the leader's live row; re-attaching
  restores the last position before any broadcast (held until `release()`).
  `end()` keeps state when the write fails so End is retryable.
- `LiveSessionCapsule` (root overlay) shows on every screen except the source,
  the follower and auth. Entry points: the radio-tower header button (Performer,
  Song Viewer; hidden for personal songs) and `LiveSessionRow` atop every share
  sheet (the Setlist Builder hands off via `/perform/:id?live=1`). One session at
  a time; starting another asks to end the current one.
- Song Stats: the Performer passes the session id to `usePerformerStats` only
  while its set leads (`song_plays.live_session_id`).

The follower side is in `src/screens/README.md`.

## In-app review request
Native store review (`expo-store-review`) after a positive interaction. **The OS
sheet is the entire UI** — no pre-prompt, no stars of our own, and no "Rate"
Settings row (if one is ever added it must deep-link to the store page, never
call `requestReview`). The platform gives **no callback**, so every request is a
spent, unverifiable attempt: gates are conservative and the attempt is banked
*before* the native call is awaited.

- `routeDwell.ts` — pure, injected clock; foreground-only time per resolved
  pathname. The `sheet` route is an **overlay** (freeze/resume), not a departure.
- `reviewEligibility.ts` — the whole policy, returning a decision plus a reason.
  Triggers: 90s+ on `viewer/[slug]` or `perform/[id]`, or leaving the reader with
  a 4+ day streak. Gates: production build, no session error, 7+ days since first
  launch, 3+ open days, intro seen before this launch, < 3 lifetime requests,
  120+ days since the last.
- `reviewState.ts` — bounded by construction (open days = count + one date).
- `sessionError.ts` — in-memory; `markSessionError` from `errors.ts` (after the
  `isAbortError` check), `api.ts`, `exportSong.ts`, and the auth screens
  (`AuthScreen`, `ForgotPasswordScreen`, `AuthLinkScreen`, `ResetPasswordScreen`).
- `reviewService.ts` — native half, mounted once as `useReviewObserver()`.
  **It derives everything from navigation state**; Viewer/Performer/reader must
  not know about it.
- **Production detection is asymmetric.** iOS `isAvailableAsync()` is a real
  signal (false for TestFlight/Xcode). Android's is not — Play internal testing
  serves the production AAB — and `EXPO_PUBLIC_BUILD_PROFILE` can't rule that
  track out. Don't "fix" this with `getIosApplicationReleaseTypeAsync()` (reports
  `APP_STORE` for TestFlight too).
- Dev builds never call the API; they log the decision and every input
  (`[review] would request now …`). That log and `__tests__/reviewFlow.test.ts`
  are how to verify changes.

## Auth
- `authFlows.ts` — email/password plus native Google
  (`@react-native-google-signin/google-signin`) and Apple
  (`expo-apple-authentication`, iOS-only) via `signInWithIdToken`; DI, tested.
  Native glue: `authDeps.ts`.
- `authSession.ts` → `resolveInitialSession` purges a dead persisted refresh token
  at launch. GoTrue still logs it from its own init, so
  `silenceInvalidRefreshTokenLogs` (installed in `supabase.ts` before the client
  is created) drops exactly that error. **Don't flip `autoRefreshToken` off to
  silence it.**
- Google config: client ids from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` /
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; the reversed iOS id goes in `app.json` →
  google-signin `iosUrlScheme`. **Android needs its own "Android"-type OAuth
  client** (package `com.gracechords.app` + the SHA-1 of every signing key: local
  debug and EAS/Play App Signing); without it sign-in fails with `DEVELOPER_ERROR`
  (code 10 → `errors.googleConfigError`). Supabase's Google provider must have
  **"Skip nonce checks"** on (iOS id-tokens carry a nonce the library can't
  reproduce). Apple manages its own nonce pair.
- Passwords & linking: Account → Security (`app/account/password.tsx`,
  `sign-in-methods.tsx`). Mode comes from core `hasPassword()` (an OAuth account
  that sets a password gets `user_metadata.password_set`, not an `email`
  identity); logic shared with web in `packages/core/src/auth/passwordChange.ts`.
  "Secure password change" is ON: setting a first password on a session older
  than 24h needs an emailed code (`requestReauthentication`). Linking uses
  `appleLink`/`googleLink` → `linkIdentity` (Apple only on iOS); unlinking is gated
  on core `canUnlink()`.
- Sprites: written to `users.preferences.sprite` (`profile.ts`), same JSON shape as
  web. Ids in `sprites.ts` must match web's `SpritePicker.jsx`. Mobile ships resized
  WebP copies of web's sprites (see `assets/README.md`).
