# Releasing the mobile app

Run from `apps/mobile/`.

| Command | Use |
|---|---|
| `npm run release:ios` / `release:android` | Bump the marketing version, then `eas build --profile production --auto-submit`. **This ships a release.** |
| `npm run build:ios` / `build:android` | Production build with **no** bump — iterating inside an unreleased train (TestFlight, Play internal). |
| `npm run version:bump` | The bump alone (`--minor` / `--major` / `--dry-run`). |
| `npm run check:aab -- path/to/app.aab` | Verify an Android bundle before upload (DEX size, R8 metrics, 16 KB alignment). Exits non-zero on failure. |

Android submission needs a Play service-account JSON at
`apps/mobile/play-service-account.json` (gitignored; path in `eas.json` →
`submit.production.android`). The **first** upload of a new app must be made by
hand in the Play Console — `eas submit` can't create the listing.

## Versioning: two independent numbers
- **Build number** (`CFBundleVersion` / `versionCode`): `eas.json` sets
  `cli.appVersionSource: "remote"` with `autoIncrement: true`, so it lives on EAS
  servers. **Don't re-add `ios.buildNumber` to `app.json`** — EAS ignores it and a
  hardcoded value makes incrementing look broken.
- **Marketing version** (`expo.version`): never auto-increments (eas-cli rejects
  `autoIncrement: "version"` with a remote source). `scripts/bump-version.mjs`
  fills the gap by rewriting the single version line with a targeted regex —
  `app.json`'s hand-tuned compact arrays (`intentFilters`, `associatedDomains`)
  must not be reflowed by a `JSON.stringify` round-trip.
- Apple closes a train once that version is **released**; later builds need a
  strictly higher version or App Store Connect rejects them (`90186`, `90062`).
  Bump per release, not per build.

## Android R8 (minify + resource shrinking)
`app.json` → `expo-build-properties` → `android` enables
`enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds`. Google
Play requires ≥25% DEX optimization from **1 Feb 2027** once uncompressed DEX
reaches 10MB, and the Expo template defaults minify to off.

- **Don't add keep rules speculatively.** `expo`, `expo-modules-core`,
  `react-native-reanimated`, `react-native-worklets` and `react-native-audio-api`
  ship `consumerProguardFiles`; `@supabase/supabase-js` is JS in Hermes (no DEX);
  `modules/differentiate-without-color` is Apple-only. Add a rule only when a
  **release** build breaks, with a comment saying what broke.
- The default rules keep `SourceFile`/`LineNumberTable` so crashes retrace.
- R8 breakage is runtime-only. Smoke-test a production build across: both native
  sign-ins and email/password, viewer + transpose, setlist autosave, PDF/PNG export
  and the share sheet, Telegram push, the Daily Word reader and an offline
  download, reminder notifications, tuner, metronome, pitch pipe, and deep links.
- **Don't upload a mapping file by hand.** AGP embeds it in the AAB and Play
  rejects a manual upload when one is embedded (only APKs need `mapping.txt`).
  `r8.json` in the bundle is optimization metrics, not a mapping.
- **Native debug symbols** are set by `plugins/withNativeDebugSymbols.js`
  (`SYMBOL_TABLE`) — nothing else exposes that option.
- **16 KB page alignment** (required from 1 Feb 2027) needs no config on SDK 55;
  `check:aab` is the proof.
- **Baseline Profile:** `plugins/withBaselineProfile.js` ships
  `android-profile/baseline-prof.txt`; record it on a device **after** R8 (see
  `android-profile/README.md`).
- `plugins/withFoojayFix.js` disables Gradle JDK auto-download, so R8 runs on the
  Expo-provisioned JDK. A future AGP bump that wants a newer JDK fails there first.
