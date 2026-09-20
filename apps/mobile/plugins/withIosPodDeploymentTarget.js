// withIosPodDeploymentTarget — Expo config plugin (CNG-safe workaround)
//
// WHY THIS EXISTS
// ---------------
// Xcode 27 refuses any target whose IPHONEOS_DEPLOYMENT_TARGET is below 15.0:
//
//     error: The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET'
//     is set to 9.0, but the range of supported deployment target versions is
//     15.0 to 27.0.x. (in target 'SDWebImage-SDWebImage' from project 'Pods')
//
// Nine vendored pod targets still declare 9.0–13.4 in their own podspecs —
// SDWebImage, GoogleSignIn, GoogleUtilities, GTMSessionFetcher, GTMAppAuth,
// AppAuth, both PromisesObjC/Swift privacy bundles, and RNCAsyncStorage's
// resource bundle. React Native's `react_native_post_install` only raises pods
// that are below ITS minimum in a way that misses these resource/privacy
// bundles, so they reach the compiler untouched and every local build fails
// before it starts. This is Xcode-version-driven, not branch-driven: EAS pins
// an older Xcode, which is why CI and release builds never saw it.
//
// This raises those stragglers to 15.1 — the app's own deployment target, and
// the minimum Expo SDK 55 declares (expo/Expo.podspec: :ios => '15.1'). It is
// deliberately NOT a bump to 16.0: nothing here needs 16, and raising the app
// target would drop iOS 15 devices that Expo still supports. The one thing that
// did need 16 was expo-router's unguarded UIMenuElement.subtitle, which is
// handled separately and correctly by apps/mobile/patches/expo-router+*.patch
// (it adds the missing `#available(iOS 16.0, *)` guards). Both are required:
// this plugin alone leaves expo-router failing, the patch alone leaves these
// nine pods failing.
//
// ios/ is gitignored and Continuous-Native-Generation regenerated, so editing
// the Podfile by hand disappears on any clean prebuild, fresh clone, or CI run.
// This re-applies on EVERY prebuild so it cannot drift out.
//
// It is idempotent: the injected block is marked, and a Podfile that already
// carries the marker is left untouched.
//
// REMOVAL: drop this once those upstream pods declare >= 15.0 themselves (or
// Expo's template raises them). Re-verify with a clean prebuild + simulator
// build before removing.

const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const MARKER = '# gracechords: raise stale pod deployment targets'
const MIN_TARGET = '15.1'

const BLOCK = `
    ${MARKER}
    # See plugins/withIosPodDeploymentTarget.js. Raises ONLY pod targets that
    # declare something older than the app's own floor. A nil or $(inherited)
    # value is left alone, so a pod inheriting a HIGHER target is never
    # silently lowered (expo-router inherits one and stops compiling if it is).
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |cfg|
        current = cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        next if current.nil?
        next if current.to_s.include?('$(inherited)')
        if current.to_f < ${MIN_TARGET}
          cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'
        end
      end
    end
`

module.exports = function withIosPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile')
      const contents = fs.readFileSync(podfilePath, 'utf8')

      // Already applied (ours, or a future template that fixed this) — no-op.
      if (contents.includes(MARKER)) return cfg

      // Append inside the existing `post_install do |installer|` block, after
      // react_native_post_install(...) closes, so RN has already done its pass
      // and we raise on top of it rather than being overwritten by it.
      const anchor = /(post_install do \|installer\|\n[\s\S]*?\n    \)\n)/
      if (!anchor.test(contents)) {
        throw new Error(
          'withIosPodDeploymentTarget: could not find the post_install block in ios/Podfile. ' +
            'The Expo Podfile template changed — update this plugin.'
        )
      }

      fs.writeFileSync(podfilePath, contents.replace(anchor, `$1${BLOCK}`), 'utf8')
      return cfg
    },
  ])
}
