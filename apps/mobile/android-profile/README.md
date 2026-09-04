# Android Baseline Profile

`baseline-prof.txt` here is copied into `android/app/src/main/` on every
prebuild by [`../plugins/withBaselineProfile.js`](../plugins/withBaselineProfile.js).
It lives here rather than in `android/` because that directory is gitignored and
CNG-regenerated — anything written there by hand is lost on the next clean
prebuild.

A profile tells ART which methods to compile ahead of time at install, instead
of interpreting them on first run. Google measures **20–40% faster cold starts**
from a current profile, and the gain is largest on low-end hardware.

**The file is empty until someone records one.** The plugin no-ops on an empty
or comment-only file, so builds work either way — they just don't get the
speed-up.

## Regenerate when

- After an Expo SDK or React Native bump.
- After a change to the startup path (splash, auth gate, Home).
- **After enabling or changing R8** — the profile names post-obfuscation
  symbols, so a profile recorded against an unminified build partly misses.
  R8 is on (see `app.json` → `expo-build-properties` → `android`), so record
  against a **release** build.

A stale profile still helps; an absent one does nothing.

## How to record

Needs a physical device or emulator on **API 33+** (no root required) and a
throwaway prebuild — none of the scaffolding below is committed, because it
would be wiped by the next `expo prebuild` anyway.

1. Generate the native project:

   ```sh
   npx expo prebuild --platform android --clean
   ```

2. In the generated `android/` project, add a `com.android.test` module (e.g.
   `:baselineprofile`) applying the `androidx.baselineprofile` plugin, and apply
   the same plugin to `:app`. Point `targetProjectPath` at `:app`.

3. Add a generator that walks the **real** critical journey, not just launch —
   this app's cost is in the chart layout search, so the profile is worth much
   more if it covers it:

   ```kotlin
   class BaselineProfileGenerator {
     @get:Rule val rule = BaselineProfileRule()

     @Test fun journey() = rule.collect(packageName = "com.gracechords.app") {
       startActivityAndWait()
       // Home -> open a song in the viewer -> transpose -> open a setlist ->
       // step through the Performer. Drive it with UiAutomator selectors.
     }
   }
   ```

4. Run it against the connected device:

   ```sh
   ./gradlew :app:generateBaselineProfile
   ```

5. Copy the result here and commit **only** this file:

   ```sh
   cp android/app/src/release/generated/baselineProfiles/baseline-prof.txt \
      android-profile/baseline-prof.txt
   ```

## Verify it is actually being used

After installing a release build:

```sh
adb shell dumpsys package dexopt | grep -A 1 com.gracechords.app
```

Expect `status=speed-profile` and `reason=install-dm`. Anything else (notably
`status=verify`) means the profile did not take.
