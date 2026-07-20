import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Icons from '../Icons.jsx'
import { ICON_MAP, WEB_PENDING } from '../iconMap.js'

// Cross-package invariant: every SF Symbol the mobile app actually uses must have a web
// mapping entry. We read the mobile source as TEXT (never import its TypeScript) so the
// web suite stays decoupled from apps/mobile's toolchain.

function repoFile(relFromRoot) {
  // Walk up from this test file until we find the monorepo root (the dir that contains
  // the mobile symbol map), then resolve the requested repo-relative path. Robust to the
  // test moving deeper/shallower in apps/web.
  let dir = dirname(fileURLToPath(import.meta.url))
  const marker = 'apps/mobile/src/components/symbolMap.ts'
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, marker))) return resolve(dir, relFromRoot)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`Could not locate monorepo root (looking for ${marker}) from ${fileURLToPath(import.meta.url)}`)
}

function mobileSfNames() {
  const names = new Set()

  // SF_TO_MATERIAL keys: lines shaped like  'chevron.left': { md: 'chevron_left', ... }
  // The `{ md:` guard skips the unquoted MATERIAL_CODEPOINTS entries above it.
  const map = readFileSync(repoFile('apps/mobile/src/components/symbolMap.ts'), 'utf8')
  for (const m of map.matchAll(/^\s*'([^']+)'\s*:\s*\{\s*md\s*:/gm)) names.add(m[1])

  // Tab-bar-only names: sf={{ default: 'house', selected: 'house.fill' }}
  const tabs = readFileSync(repoFile('apps/mobile/app/(tabs)/_layout.tsx'), 'utf8')
  for (const m of tabs.matchAll(/(?:default|selected)\s*:\s*'([^']+)'/g)) names.add(m[1])

  return names
}

describe('icon parity (web ↔ mobile)', () => {
  const mobile = mobileSfNames()

  it('finds a non-trivial mobile SF vocabulary', () => {
    // Guards against a silent parse regression that would make every check vacuously pass.
    expect(mobile.size).toBeGreaterThan(50)
  })

  it('maps every mobile SF symbol in ICON_MAP (no drift)', () => {
    const missing = [...mobile].filter((sf) => !(sf in ICON_MAP)).sort()
    expect(missing, `SF symbols used by apps/mobile but absent from iconMap.js: ${missing.join(', ')}`).toEqual([])
  })

  it('backs every ICON_MAP entry with a web export or an explicit WEB_PENDING allowlist entry', () => {
    const pending = new Set(WEB_PENDING)
    const unbacked = Object.values(ICON_MAP)
      .map((e) => e.web)
      .filter((name) => !(name in Icons) && !pending.has(name))
      .sort()
    expect(unbacked, `web exports named in iconMap.js but neither in Icons.jsx nor WEB_PENDING: ${unbacked.join(', ')}`).toEqual([])
  })

  it('has no stale WEB_PENDING entries (each is genuinely not yet exported)', () => {
    const stale = WEB_PENDING.filter((name) => name in Icons).sort()
    expect(stale, `WEB_PENDING lists exports that now EXIST in Icons.jsx — remove them: ${stale.join(', ')}`).toEqual([])
  })
})
