// withBaselineProfile — Expo config plugin (CNG-safe)
//
// WHY THIS EXISTS
// ---------------
// A Baseline Profile lets ART ahead-of-time compile the methods an app actually
// runs on startup, instead of interpreting them and JIT-ing later. Google
// measures 20–40% faster cold starts from a current profile; the win is largest
// on exactly the kind of low-end hardware this was added for.
//
// AGP picks the profile up from `android/app/src/main/baseline-prof.txt` — the
// directory that holds AndroidManifest.xml. But android/ is gitignored and
// Continuous-Native-Generation regenerated, so a file written there by hand
// disappears on the next clean `expo prebuild`, fresh clone or CI run (the same
// trap withFoojayFix.js exists for). The profile therefore lives at a TRACKED
// path and is copied into place on every prebuild.
//
// The profile is a build INPUT, not something this plugin can produce: it has to
// be recorded from a real device run. See android-profile/README.md for the
// procedure. Until one is recorded the source file is empty, and this plugin
// deliberately does nothing rather than writing an empty baseline-prof.txt —
// an empty profile is not merely useless, it tells ART there is nothing worth
// compiling.
//
// REGENERATE after any change that moves the startup path (a React Native or
// Expo SDK bump, a new splash/auth flow, and notably after enabling or changing
// R8, since the profile references post-obfuscation symbols). A stale profile
// still helps, but it decays.

const fs = require('fs')
const path = require('path')
const { withDangerousMod } = require('@expo/config-plugins')

const SOURCE = path.join('android-profile', 'baseline-prof.txt')

module.exports = function withBaselineProfile(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, SOURCE)

      // Absent or not yet recorded — leave the build alone.
      if (!fs.existsSync(src)) return cfg
      const contents = fs.readFileSync(src, 'utf8')
      // Ignore comment-only scaffolding; a profile is one rule per line.
      const rules = contents
        .split('\n')
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
      if (!rules.length) return cfg

      const dest = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'baseline-prof.txt'
      )
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, `${rules.join('\n')}\n`)
      return cfg
    },
  ])
}
