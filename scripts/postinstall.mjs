// Robust postinstall runner for patch-package.
//
// The root postinstall applies patches (currently a mobile-only React Native
// gradle-plugin patch). Running the bare `patch-package` binary relies on
// npm having linked node_modules/.bin/patch-package. Some deploy environments
// (e.g. Cloudflare Pages, which restores a node_modules cache before running
// `npm install`) do not reliably re-create that bin symlink, so the bare
// command fails with "patch-package: not found" (exit 127) and aborts the
// whole build — even though the web build has no need for the mobile patch.
//
// This script instead resolves the patch-package package directly and runs its
// entrypoint through Node, which does not depend on the .bin symlink. If
// patch-package cannot be resolved at all (e.g. it was not installed in this
// environment), it skips gracefully so a missing mobile-only patch can never
// break an unrelated build.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

let binPath
try {
  const pkgJsonPath = require.resolve('patch-package/package.json')
  const pkg = require('patch-package/package.json')
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['patch-package']
  if (!bin) {
    console.log('[postinstall] patch-package has no bin entry; skipping.')
    process.exit(0)
  }
  binPath = path.resolve(path.dirname(pkgJsonPath), bin)
} catch {
  console.log('[postinstall] patch-package not installed; skipping patch application.')
  process.exit(0)
}

// Patches are applied once per directory that owns a node_modules tree, because
// patch-package resolves both `patches/` and `node_modules/` relative to its cwd.
// The root holds the hoisted packages (@react-native/gradle-plugin); apps/mobile
// keeps its own copies of anything npm could not hoist — expo-router among them,
// which carries an iOS build fix (see apps/mobile/patches). A workspace with no
// patches/ directory is skipped rather than run, so this stays quiet for the
// common case.
const roots = [
  path.resolve(process.cwd()),
  path.resolve(process.cwd(), 'apps/mobile'),
]

let status = 0
for (const cwd of roots) {
  if (!existsSync(path.join(cwd, 'patches'))) continue
  if (!existsSync(path.join(cwd, 'node_modules'))) {
    console.log(`[postinstall] ${cwd}: no node_modules; skipping its patches.`)
    continue
  }
  const result = spawnSync(process.execPath, [binPath], { stdio: 'inherit', cwd })
  status = status || (result.status ?? 0)
}
process.exit(status)
