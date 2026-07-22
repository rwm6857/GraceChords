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

const result = spawnSync(process.execPath, [binPath], { stdio: 'inherit' })
process.exit(result.status ?? 0)
