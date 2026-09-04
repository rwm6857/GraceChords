// withNativeDebugSymbols — Expo config plugin (CNG-safe)
//
// WHY THIS EXISTS
// ---------------
// R8 obfuscates Java/Kotlin, and AGP handles the deobfuscation side of that by
// itself: for an APP BUNDLE it embeds the mapping at
// BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map, and Play
// extracts it on upload. (Do NOT upload a mapping by hand — Play rejects it when
// one is already embedded. And note r8.json is a different file: those are the
// optimization METRICS Play reads for the >=25% quality gate, not a mapping.)
//
// Native code gets no such treatment. Nothing in the Expo SDK 55 Android
// template sets `debugSymbolLevel`, and expo-build-properties exposes no option
// for it, so Play warns "no debug symbols for native code" and every native
// crash — Hermes, Reanimated, react-native-audio-api — symbolicates to raw
// addresses instead of function names.
//
// SYMBOL_TABLE, not FULL: function names in Play's symbolicated stack traces
// plus tombstone support, at a fraction of the size. FULL adds file names and
// line numbers and can approach Play's 1.6GB symbol limit. Either way the
// symbols live only in the artifact uploaded to Play — they are stripped from
// what users download, so there is no size cost to users.
//
// android/ is gitignored and Continuous-Native-Generation regenerated, so a hand
// edit to app/build.gradle disappears on the next clean prebuild — the same trap
// withFoojayFix.js exists for. Hence a plugin.
//
// The documented top-level assignment form is used rather than injecting into
// the nested buildTypes.release block: it is a single append with no brace
// matching, so it cannot be broken by a template reshuffle.
//
// REMOVAL: delete once expo-build-properties gains a native-symbols option, or
// once the Expo template sets debugSymbolLevel itself.

const { withAppBuildGradle } = require('@expo/config-plugins')

const PROPERTY = 'android.buildTypes.release.ndk.debugSymbolLevel'
const LEVEL = 'SYMBOL_TABLE'
const BLOCK = [
  '',
  '// Native debug symbols for Play crash symbolication (withNativeDebugSymbols).',
  `${PROPERTY} = '${LEVEL}'`,
  '',
].join('\n')

module.exports = function withNativeDebugSymbols(config) {
  return withAppBuildGradle(config, (cfg) => {
    // Groovy only. The Expo template ships build.gradle, not build.gradle.kts;
    // if that ever changes, do nothing rather than emit invalid Kotlin.
    if (cfg.modResults.language !== 'groovy') return cfg

    // Already set in any form — ours, or a future template that does it itself.
    if (cfg.modResults.contents.includes('debugSymbolLevel')) return cfg

    cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${BLOCK}`
    return cfg
  })
}
