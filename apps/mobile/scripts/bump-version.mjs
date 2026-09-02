#!/usr/bin/env node
// Bumps the marketing version (expo.version -> CFBundleShortVersionString).
//
// EAS cannot do this for us: `autoIncrement: "version"` throws when
// `cli.appVersionSource` is "remote", and remote versioning tracks only the
// build number. So `autoIncrement: true` in eas.json keeps the build number
// monotonic, and this script opens the next release train.
//
// Apple closes a version train once that version is released, and every later
// build must carry a strictly higher CFBundleShortVersionString. Run this when
// shipping a release *after* one has gone live; repeat builds within a train
// only need the build number, which EAS already handles.
//
// Usage: node scripts/bump-version.mjs [--patch|--minor|--major] [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appJsonPath = join(mobileDir, 'app.json')
const pkgJsonPath = join(mobileDir, 'package.json')

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const level = args.has('--major') ? 'major' : args.has('--minor') ? 'minor' : 'patch'

// Rewrite the one version line with a targeted replace rather than
// JSON.stringify: app.json has hand-tuned compact arrays (intentFilters,
// associatedDomains) that a reserialize would reflow into noise.
function replaceVersion(source, next, label) {
  const pattern = /("version":\s*)"\d+\.\d+\.\d+"/
  const matches = source.match(new RegExp(pattern, 'g')) ?? []
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one "version" field, found ${matches.length}`)
  }
  return source.replace(pattern, `$1"${next}"`)
}

const appJsonRaw = readFileSync(appJsonPath, 'utf8')
const current = JSON.parse(appJsonRaw).expo?.version
if (!current) throw new Error('app.json: expo.version is missing')

const parts = current.match(/^(\d+)\.(\d+)\.(\d+)$/)
if (!parts) throw new Error(`app.json: expo.version "${current}" is not a plain x.y.z semver`)

let [major, minor, patch] = parts.slice(1).map(Number)
if (level === 'major') [major, minor, patch] = [major + 1, 0, 0]
else if (level === 'minor') [minor, patch] = [minor + 1, 0]
else patch += 1
const next = `${major}.${minor}.${patch}`

if (dryRun) {
  console.log(`${current} -> ${next} (${level}, dry run — nothing written)`)
  process.exit(0)
}

writeFileSync(appJsonPath, replaceVersion(appJsonRaw, next, 'app.json'))
// Kept in lockstep purely to stop the two files drifting; nothing reads it at
// runtime (About renders Constants.expoConfig) and EAS reads app.json.
writeFileSync(pkgJsonPath, replaceVersion(readFileSync(pkgJsonPath, 'utf8'), next, 'package.json'))

console.log(`Bumped version ${current} -> ${next} (${level}) in app.json and package.json`)
console.log('Commit this before or alongside the build so the train is recorded in git.')
