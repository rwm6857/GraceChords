# Screens — feature notes

Route files under `app/` are thin wrappers that render these screens. Shared
logic lives in `src/lib` (see its README).

## Song Viewer (`app/viewer/[slug].tsx`, `ChordChart`)
- Renders a parsed `SongDoc` (core `parseChordProOrLegacy`): word-anchored chords,
  per-symbol transpose and chord style at render, `RawFallback` when parsing yields
  nothing.
- Controls: floating `TransposeBar` (±1 semitone, haptic); `ViewOptionsSheet`
  (chords/lyrics, section labels, font 80–160%, Letters/Solfège, sharp/flat,
  a 1–3 column ceiling on tablets, "Hide controls when idle"); `StarButton`;
  `ExportSheet`.
- Transpose, accidentals and chord style are **ephemeral** per open. "Hide controls
  when idle" persists (`autoHideChrome.ts`); the column ceiling persists
  **globally**, Viewer and Performer alike (`viewerPrefs.ts`). A setlist open
  seeds transpose via the `initialKey` param.
- **Auto-fit columns** (`AutoFitChart` + `useChartAutoFit`, `src/lib/columnLayout.ts`,
  `src/lib/columnCapacity.ts`): multiple columns on tablets only (min dimension
  ≥ 600; 3 columns from ≥ 800 and when the width allows). The stored value is a
  **ceiling**: the planner picks the largest font that fits on one screen (chrome
  visible, then chrome hidden), tie-broken by fewest columns, and otherwise
  scrolls. Packing is ordered and **balanced** (minimizes the tallest column),
  sections atomic. Section heights are measured offscreen and cached per layout
  input; the planner, capacity and persistence logic are unit-tested.

## Performer (`app/perform/[id].tsx`)
Plays a set one song at a time (Prev/Next, swipe, progress rail), prefetches every
song body, and reuses the Viewer's chart and options. `PerformerShareSheet` has a
This-song / Whole-set scope toggle — whole-set PDF lives here (and in the
builder's `ShareSetSheet`).

## Live-session follower (`app/session/[code].tsx`)
The third consumer of the chart (`AutoFitChart` + `useChartAutoFit` +
`ViewOptionsSheet`). It must **never** gain anything that competes with the leader
— no transpose, no key picker. The join code's tier gates the chord-only options,
which is why those `ViewOptionsSheet` props are optional (not rendered, not inert,
on the lyric tier). Its header never auto-hides (`headerH: 0`,
`chromeVisible: true`). The route is public (anonymous followers).

## Setlists
- Per-user Supabase tables `setlists` / `setlist_songs`; the per-entry key override
  (`setlist_songs.key_override`) is `toKey` app-side. Queries live in core's
  `setlistsRepo`; hooks `useSetlists`, `useSetlistBuilder` (debounced
  wipe-and-replace autosave), `useLastSet` (Home's "Last set").
- **Import** (`app/setlist/import.tsx` → `SetlistImportScreen`) is the target of
  shared-setlist deep links. `src/lib/setlistImport.ts` (tested) decodes the compact
  code via core `decodeSet` or splits the slug-list form; slugs resolve against the
  catalog, misses are dropped with a warning, and "Save to my setlists" creates a
  normal setlist named "Imported setlist" (shared links never carry a title).

## Export & share
Server-side via the web app's Pages Functions (`EXPO_PUBLIC_API_BASE_URL`,
`src/lib/api.ts`). `exportSong.ts` → `POST /api/export/song` (PDF, or page-1 PNG
for `jpg`) and `/api/export/setlist` (whole-set PDF); bytes are cached with
`expo-file-system` and shared via `expo-sharing`. `telegramPush.ts` →
`/api/telegram/push` (batched at 25; 409 → "link your Telegram"). No ChordPro
export, by design.

## Home & tablet layouts
- Home is a card dashboard (`src/components/home/`): hero + Continue full-width
  (capped at `layout.maxWidth.dashboard`), then Last set / Starred / Daily Word /
  Recent songs — 2 columns at regular width, one stack on phones.
- Song Library at regular width chunks each letter section into rows of N
  `ListRow`s (`gridRows.ts`, `layout.libraryColumns`). Presentation only — section
  headers, the A–Z scrubber, and search/sort are unchanged.
- Setlist Builder at regular width is a list-detail split (`layout.split`): a
  searchable `LibraryPane` (own list instance) using the same `toggleSong` write
  path as `AddSongsModal`, beside the unchanged builder. The Add button/modal is
  phone-only.
- Utilities at regular width: tool list left, the picked tool inline right via each
  tool screen's `embedded` prop. Phones push the tool routes.

## First-launch intro (`IntroScreen`)
Three cards, once per device, post-auth: title, features, and two **real
settings** (Daily Word reminder via `ReminderTimeSheet`, reading streak) presented
pre-toggled ON. The seen flag is device-local (`introSeen.ts`), so a new device
shows it again by design. `wantsIntro()` in `app/_layout.tsx` redirects only from
the app's own entry points so deep links keep their destination. Both exits land
on Home; **"Get started" is the only place notification permission is requested**
(`commitOnboardingReminder`, fails silently on denial); **Skip commits nothing**.
Settings → Support → "See onboarding again" replays it.

## Settings
Grouped: profile card (→ Account), theme, Language (`OptionSheet`: Automatic +
supported locales), chord style, Offline & downloads, Reader ("Daily Word opens",
reminder, streak), library shortcuts, and Support (Help/Feedback, About,
"See onboarding again").

Account (`app/account/index.tsx` → `AccountScreen`) holds the sprite picker,
Security (password, sign-in methods), Telegram, Song Stats, sign-out, and Delete
account (`supabase.rpc('delete_user')`).

## Daily Word landing (`DailyWordLandingScreen`)
- Default tab root: today's M'Cheyne reading, today's **devotionals**, and the
  user's private reflection, routing onward to the Reader (`app/daily/reader.tsx`,
  with a back chevron via `showBackToLanding`). "Daily Word opens" in Settings can
  make the tab open the Reader directly.
- **Devotionals** (`src/lib/devotionals/`, `src/components/devotional/`) are matched
  to the day by scripture, so they sit with the readings, not on Home.
  `DevotionalSection` renders nothing until content has downloaded — never a
  "no devotional" placeholder or spinner for an in-flight day; the placeholder is
  only for genuinely open days.
- **Reflections are private-only** (`public.reflections`, owner-scoped RLS, one per
  day). They are editable through the `own_update_private` policy (owner +
  `visibility='private'` in USING and WITH CHECK). Queries live in core's
  `reflectionsRepo`; hooks `useTodayReflection` / `useReflectionList`. Core's
  `ReflectionVisibility` is the literal `'private'`. **Don't build any
  public-content surface** without reopening App Store Guideline 1.2 — see
  `apps/web/functions/api/reflections/README.md`.
