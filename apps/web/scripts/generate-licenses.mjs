#!/usr/bin/env node
// Generates the third-party open-source attribution file rendered at /licenses.
//
// Enumerates the *production* dependency closure of both apps (web + mobile) via
// `npm ls --omit=dev`, then pulls license metadata for the installed tree with
// license-checker, and writes a sorted markdown listing to
// src/content/third-party-licenses.md.
//
// This covers third-party dependency notices only. GraceChords' own source is
// Apache-2.0 (see LICENSE) and is not part of this file. Scripture-text
// attribution is a separate, hand-maintained section in LicensesPage.jsx.
//
// Run: npm run generate:licenses -w @gracechords/web

import { execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import checker from 'license-checker'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const outFile = resolve(scriptDir, '../src/content/third-party-licenses.md')

// 1. Production dependency closure (names) across both shipped apps.
function productionClosure() {
  const raw = execFileSync(
    'npm',
    ['ls', '--omit=dev', '--all', '--json',
     '--workspace', '@gracechords/web',
     '--workspace', '@gracechords/mobile'],
    { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }
  )
  const tree = JSON.parse(raw)
  const names = new Set()
  const walk = (deps) => {
    if (!deps) return
    for (const [name, info] of Object.entries(deps)) {
      names.add(name)
      walk(info.dependencies)
    }
  }
  walk(tree.dependencies)
  if (tree.workspaces) for (const ws of Object.values(tree.workspaces)) walk(ws.dependencies)
  return names
}

// 2. License metadata for the whole installed tree.
async function licenseMetadata() {
  const init = promisify(checker.init)
  return init({ start: repoRoot })
}

function repoUrl(entry) {
  const url = entry.repository || ''
  return url.replace(/^git\+/, '').replace(/\.git$/, '')
}

function splitNameVersion(key) {
  const at = key.lastIndexOf('@')
  return { name: key.slice(0, at), version: key.slice(at + 1) }
}

const closure = productionClosure()
const meta = await licenseMetadata()

const entries = []
for (const [key, entry] of Object.entries(meta)) {
  const { name, version } = splitNameVersion(key)
  if (!closure.has(name)) continue
  if (name.startsWith('@gracechords/')) continue // our own workspace packages
  entries.push({ name, version, license: entry.licenses, repo: repoUrl(entry) })
}

entries.sort((a, b) =>
  a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
)

const lines = []
lines.push('## Open-Source Components')
lines.push('')
lines.push(
  `GraceChords is built with the open-source software listed below (${entries.length} ` +
  'packages), each distributed under its own license. We are grateful to the ' +
  'authors and maintainers of these projects.'
)
lines.push('')
for (const e of entries) {
  const license = Array.isArray(e.license) ? e.license.join(', ') : (e.license || 'See project')
  const suffix = e.repo ? ` — [${e.repo}](${e.repo})` : ''
  lines.push(`- **${e.name}** ${e.version} — ${license}${suffix}`)
}
lines.push('')

writeFileSync(outFile, lines.join('\n'), 'utf8')
console.log(`Wrote ${entries.length} entries to ${outFile}`)
