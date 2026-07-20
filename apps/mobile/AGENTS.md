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
  offline downloads), `expo-build-properties` (`useFrameworks: static`,
  required by google-signin), and `expo-dev-client` (dev launcher — see the
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
  `/tuner`, `/metronome`, `/pitch-pipe` as routes.
- **Option sheets:** every sheet presents through the native `formSheet` route
  (`app/sheet.tsx` + `src/lib/formSheetHost.ts` — screens keep owning
  state/callbacks; the host bridges the render into the route, one sheet at a
  time). Phones get a native bottom sheet with grabber/detents, iPads a
  centered narrow form sheet. The ONE exception is the builder's
  `RowActionsSheet`, which stays on the hand-rolled `BottomSheet` Modal because
  it chains into the key picker via `onDismissed`; if you add a new sheet, use
  the `useFormSheet` + `FormSheetShell` pattern.
- **Icons are native design-system glyphs only** (no hand-drawn/SVG), always via
  `src/components/SymbolIcon.tsx`. Call sites pass a single SF Symbol `name`;
  `SymbolIcon` branches internally on `Platform.OS`: iOS renders it through
  `expo-symbols` (`SymbolView`), Android maps the SF name to a Material Symbols
  glyph via `src/components/symbolMap.ts` and renders it from the subset fonts in
  `assets/fonts/` (`MaterialSymbolsOutlined`/`MaterialSymbolsFilled`, registered
  in `app/_layout.tsx`). **When you introduce a new icon, add its SF→Material
  mapping to `symbolMap.ts` and re-run the font subset build** so the Android
  glyph exists — an unmapped name renders a fallback and warns in dev. Pass the
  optional `md` prop only to override an ambiguous auto-mapping (iOS ignores it).
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
- **Authenticated-only.** `app/_layout.tsx` gates every route on the Supabase
  session (redirect to `/login` when signed out, into the tabs when signed in) and
  holds the native splash (`expo-splash-screen`) until the session resolves *and*
  the correct screen is mounted, so nothing flashes on first open. Session persists
  via AsyncStorage until uninstall — don't add proactive sign-outs. Exception:
  `choose-icon` is reachable both with and without a session (post-signup step —
  email confirmation may still be pending).
- **Deep links / Universal Links.** iOS Universal Links are wired via
  `ios.associatedDomains: ["applinks:gracechords.com"]` (apex only, no `www`) +
  `app/+native-intent.tsx` `redirectSystemPath`, and the AASA file lives in the
  **web** repo at `apps/web/public/.well-known/apple-app-site-association`.
  Handled paths:
  - `/song/:id`, `/songs/:id` (id == slug) → `/viewer/:slug` (the app has no
    `/song` route).
  - Shared setlists `/setlist/<slugs>?toKeys=`, `/set/<CODE>`, and the
    `/worship/...` mirrors → `/setlist/import` (the read-only import preview,
    `SetlistImportScreen`). Decode/resolve lives in `src/lib/setlistImport.ts`
    (unit-tested), reusing core `decodeSet` for the compact code form and a plain
    split for the slug-list form; slugs resolve against the shared catalog, misses
    are dropped with a warning, and "Save to my setlists" creates a normal setlist
    row (default name "Imported setlist"). Shared links never carry a title.
  Changing `associatedDomains` / `intentFilters` needs a **fresh native build**
  (prebuild + EAS), not an OTA. **TODO(android)** — `android.intentFilters` are
  wired but dormant until an Android signing key exists and its SHA-256 lands in
  the web `assetlinks.json`.
- **Auth flows.** Email/password plus native Google
  (`@react-native-google-signin/google-signin`) and Apple
  (`expo-apple-authentication`, iOS-only button) via
  `supabase.auth.signInWithIdToken`. The orchestration lives in
  `src/lib/authFlows.ts` as dependency-injected, RN-free functions (tested with
  vitest — `npm run test`); the only native-importing glue is
  `src/lib/authDeps.ts`. Google client ids come from
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and the
  reversed iOS client id must be set in `app.json` → google-signin plugin
  `iosUrlScheme`. Supabase's Google provider must have **"Skip nonce checks"**
  enabled: iOS embeds a nonce in the id-token that the free google-signin lib
  can't reproduce, so otherwise `signInWithIdToken` rejects it ("Passed nonce and
  nonce in id_token should either both exist or not"). Apple is unaffected — it
  drives the raw/hashed nonce pair itself (see `appleSignIn`). The sprite pick is written to `users.preferences.sprite`
  (`src/lib/profile.ts`) — the same JSONB shape the web Profile page writes; ids in
  `src/lib/sprites.ts` must stay in sync with web's `SpritePicker.jsx`.

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
- **Daily Word reminder** (Settings → Reader) is an OPT-IN, off-by-default local
  notification via **`expo-notifications`** (config plugin in `app.json`). The
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
  The time is set via a custom stepper sheet (`ReminderTimeSheet` — RN
  primitives, no extra native picker dep, like `DatePickerSheet`). The app root
  hydrates the preference at splash and reconciles the OS schedule on launch.
- **App-wide defaults** live in `src/lib/defaults.ts` — `theme`
  (`system`/`light`/`dark`) and `chordStyle` (`letters`/`solfege`), **device-local
  in AsyncStorage, not Supabase-synced**. Storage is injected (KVStorage, like
  `profile.ts`) so the module is RN-free and unit-tested. Hydrated once at the
  splash hold; `getDefaultsSnapshot()` is then synchronous and `useAppDefaults()`
  (a `useSyncExternalStore` hook) re-renders the ThemeProvider and Settings.
  Viewer/Performer seed their chord style read-on-open; in-session changes don't
  write back.

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
  `useSyncExternalStore` pattern): OPT-IN, off by default — the toggle lives in
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
  journal "Edit" actions reach it. Public posts stay immutable. Queries live in
  core (`reflections/reflectionsRepo.js`); mobile hooks are
  `useTodayReflection`/`useReflectionList` (both expose `update`). The
  `visibility` column carries public "Shared Reflections" too.
  **Phase 2A (backend + moderation)** is server-side — the `feature_flags` kill
  switch (`public_reflections`, **enabled** by migration
  `20260719000300_enable_public_reflections.sql`; flip the row to `false` in the
  Supabase dashboard to take the feature back down), `banned_users`, `reports`,
  `reflection_hearts`, soft-delete columns, the moderated submit/report Pages
  Functions, and the Telegram report alert (see `apps/web/AGENTS.md` → "Public
  reflections moderation"). **Phase 2B (client surfaces)** is the landing's
  **Shared Reflections** feature, gated on `usePublicReflectionsEnabled()` so it
  stays dark until an admin flips the flag (private reflection + journal are
  untouched when off): an anonymous today-only feed (`SharedReflectionsFeed`;
  the feed query selects **only** `id/body/heart_count` — never `user_id`),
  optimistic hearts (`usePublicFeed`/`reflection_hearts`, self-heart blocked; a
  user is **never served their own post** back in the feed — they read it, with
  its live heart count, in the "Share a reflection" slot), the **unified
  composer** (`ReflectionComposeScreen`, one `app/daily/reflection.tsx` route)
  with a **Private/Shared toggle** — selecting Shared posts through the moderated
  `/api/reflections/submit` (`reflectionsApi.ts`) behind the UGC gate + an
  explicit confirm, so nothing goes public without a deliberate action; the
  landing/journal pass `visibility=public` to preset the toggle. The Apple-1.2
  **UGC gate**
  (`UgcTermsSheet` + `accept_ugc_terms()` RPC → `users.ugc_accepted_at`,
  migration `20260719000200_ugc_acceptance.sql`; gate copy in `ugcTerms.ts`,
  full terms in web `terms-of-use.md`), report + local **hide** (`hiddenPosts.ts`,
  device-local), and the journal now listing public + private with heart counts.
  Public reflections are **never** a client insert — only the service-role submit
  endpoint writes them. The
  landing's **devotional** hero card + long-read page from the design are
  **dropped** (no public-domain content pipeline was ever built); the landing's
  lead slot — above today's reading — is reserved for the **Phase-2 public
  reflections feed**, which will take the devotional's place there.
- **Daily Word / Reader** reads the day's M'Cheyne passages from Cloudflare R2.
  Shared, DOM-free logic (plan lookup, reading expansion, translation manifest,
  RTL, chapter/copy helpers) lives in core's `bible` module (`@gracechords/core`),
  base-URL injected. `src/lib/bibleSource.ts` is the **single source seam**
  (`getPassage`/`getTranslations`) via `EXPO_PUBLIC_R2_PUBLIC_URL`
  (default `https://assets.gracechords.com`); it now reads **offline-first** —
  `getPassage` returns a downloaded chapter blob when one exists (see the
  downloads module below) and falls back to R2 otherwise. Hooks:
  `useBibleTranslations`, `usePassageChapter` (`src/lib/useReader.ts`). Reader
  settings (size/typeface/layout/spacing) are **session-ephemeral** — not tied to
  Settings, so they reset on relaunch. **Follow-up:** `apps/web`'s
  `features/readings` + `utils/bible` still hold their own copy of this logic;
  migrate web onto core's `bible` module to remove the duplication.
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
link is an informational alert only), tablet master-detail, EAS Build /
TestFlight, Android (auth code is cross-platform-safe, but Android OAuth config —
SHA-1, google-services — is not set up), GraceTracks, and migrating web's
`features/readings` onto core's `bible` module.
