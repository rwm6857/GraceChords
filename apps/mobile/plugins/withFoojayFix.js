// withFoojayFix — Expo config plugin (CNG-safe workaround)
//
// WHY THIS EXISTS
// ---------------
// Expo SDK 55's default Android template (Expo ~55.0.27, React Native 0.83.6)
// resolves an older build of the Gradle `foojay-resolver-convention` plugin that
// crashes under Gradle 9.0.0 with:
//
//     NoSuchFieldError: JvmVendorSpec.IBM_SEMERU
//
// (a known upstream bug — the stale resolver references a JvmVendorSpec field
// that Gradle 9 removed). The fix is to pin the resolver to version "1.0.0" in
// android/settings.gradle's existing `plugins { }` block.
//
// android/ is gitignored and Continuous-Native-Generation regenerated, so a
// hand edit to settings.gradle silently disappears on any clean `expo prebuild`,
// fresh clone, or CI run — reproducing the exact multi-hour failure. This plugin
// re-applies the fix on EVERY prebuild so it can't drift out.
//
// It is idempotent: if the resolver id is already present (our pin, or a future
// Expo template that ships a fixed version), the settings.gradle is left
// untouched — the line is never duplicated.
//
// As belt-and-suspenders it also sets `org.gradle.java.installations.auto-download=false`
// in gradle.properties. This did NOT independently fix the crash, but it stops
// Gradle from invoking the toolchain auto-download path (the code path that
// triggers the buggy resolver in the first place), so the two together avoid the
// crash rather than relying on the pin alone. Safe because the RN/Expo toolchain
// provisions JDK 17 itself; drop this half if you want the plugin minimal.
//
// REMOVAL: this whole plugin can very likely be deleted once Expo ships an SDK
// whose Android template resolves a foojay-resolver-convention version that is
// compatible with the bundled Gradle wrapper. Re-verify with a clean prebuild
// after any Expo SDK / Gradle bump before removing.

const {
  withSettingsGradle,
  withGradleProperties,
} = require('@expo/config-plugins')

const FOOJAY_ID = 'org.gradle.toolchains.foojay-resolver-convention'
const FOOJAY_VERSION = '1.0.0'
const FOOJAY_LINE = `    id("${FOOJAY_ID}") version "${FOOJAY_VERSION}"`

const AUTO_DOWNLOAD_KEY = 'org.gradle.java.installations.auto-download'
const AUTO_DOWNLOAD_VALUE = 'false'

function withFoojaySettingsGradle(config) {
  return withSettingsGradle(config, (cfg) => {
    const contents = cfg.modResults.contents

    // Already present in any form (our pin or a future fixed template) — no-op.
    if (contents.includes(FOOJAY_ID)) {
      return cfg
    }

    // Insert into the existing `plugins { }` block, right after its opening brace.
    if (/plugins\s*\{/.test(contents)) {
      cfg.modResults.contents = contents.replace(
        /plugins\s*\{/,
        (match) => `${match}\n${FOOJAY_LINE}`
      )
    } else {
      // No plugins block found (unexpected for the SDK 55 template) — prepend one
      // so the pin still lands rather than silently doing nothing.
      cfg.modResults.contents = `plugins {\n${FOOJAY_LINE}\n}\n\n${contents}`
    }

    return cfg
  })
}

function withFoojayGradleProperties(config) {
  return withGradleProperties(config, (cfg) => {
    const already = cfg.modResults.some(
      (item) => item.type === 'property' && item.key === AUTO_DOWNLOAD_KEY
    )
    if (!already) {
      cfg.modResults.push({
        type: 'property',
        key: AUTO_DOWNLOAD_KEY,
        value: AUTO_DOWNLOAD_VALUE,
      })
    }
    return cfg
  })
}

module.exports = function withFoojayFix(config) {
  config = withFoojaySettingsGradle(config)
  config = withFoojayGradleProperties(config)
  return config
}
