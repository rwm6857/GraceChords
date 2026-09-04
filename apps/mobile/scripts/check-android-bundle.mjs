#!/usr/bin/env node
// Pre-flight the two Google Play technical-quality gates against a built
// artifact, so neither is discovered from a Play Console warning after upload.
//
//   node scripts/check-android-bundle.mjs <path to .aab or .apk>
//
// 1. DEX code optimization (enforced from 1 Feb 2027). Play requires >=25%
//    optimization/obfuscation/shrinking once uncompressed DEX reaches 10MB for
//    an app. R8 records what it did in BUNDLE-METADATA/com.android.tools/r8.json.
// 2. 16 KB page sizes (required for updates from 1 Feb 2027). Every bundled
//    .so must have its PT_LOAD segments aligned to at least 16384, or the app
//    will not load on 16 KB-page devices.
//
// Reads the archive with `unzip` and parses ELF program headers directly, so
// there is nothing to install and no NDK required.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const DEX_ENFORCEMENT_BYTES = 10 * 1024 * 1024
const MIN_OPTIMIZATION_PCT = 25
const REQUIRED_ALIGNMENT = 16384

const artifact = process.argv[2]
if (!artifact) {
  console.error('usage: node scripts/check-android-bundle.mjs <path to .aab or .apk>')
  process.exit(2)
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`
let failed = false
const fail = (msg) => {
  failed = true
  console.log(`  FAIL  ${msg}`)
}
const pass = (msg) => console.log(`  ok    ${msg}`)
const note = (msg) => console.log(`  --    ${msg}`)

const listing = execFileSync('unzip', ['-l', artifact], { encoding: 'utf8' })
const entries = listing
  .split('\n')
  .map((line) => line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(.+?)\s*$/))
  .filter(Boolean)
  .map((m) => ({ size: Number(m[1]), name: m[2] }))

// ── 1. DEX size + R8 metrics ────────────────────────────────────────────────
console.log('\nDEX code optimization')
const dexBytes = entries
  .filter((e) => e.name.endsWith('.dex'))
  .reduce((sum, e) => sum + e.size, 0)
console.log(`  uncompressed DEX: ${mb(dexBytes)} (Play enforces at ${mb(DEX_ENFORCEMENT_BYTES)})`)

let r8 = null
try {
  r8 = JSON.parse(execFileSync('unzip', ['-p', artifact, 'BUNDLE-METADATA/com.android.tools/r8.json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }))
} catch {
  /* not an R8 build, or an APK rather than an AAB */
}

if (!r8) {
  const msg = 'no r8.json — R8 did not run, so optimization/shrinking/obfuscation are all 0%'
  if (dexBytes >= DEX_ENFORCEMENT_BYTES) fail(msg)
  else note(`${msg} (under the size gate today, but the margin is not guaranteed)`)
} else {
  // R8 reports these under varying key names across versions; match loosely.
  const pct = (needle) => {
    const key = Object.keys(r8).find((k) => k.toLowerCase().includes(needle))
    const raw = key ? r8[key] : undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) ? (n <= 1 ? n * 100 : n) : null
  }
  for (const needle of ['optimi', 'obfusca', 'shrink']) {
    const value = pct(needle)
    if (value == null) {
      note(`${needle}: not reported by this R8 version — read r8.json by hand`)
      continue
    }
    const label = `${needle}: ${value.toFixed(1)}%`
    if (value >= MIN_OPTIMIZATION_PCT) pass(label)
    else if (dexBytes >= DEX_ENFORCEMENT_BYTES) fail(`${label} (below the ${MIN_OPTIMIZATION_PCT}% minimum)`)
    else note(`${label} (below ${MIN_OPTIMIZATION_PCT}%, but under the size gate)`)
  }
}

// ── 2. 16 KB page-size alignment ────────────────────────────────────────────
console.log('\n16 KB page size')
const sos = entries.filter((e) => e.name.endsWith('.so'))
if (!sos.length) {
  pass('no bundled native libraries')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'gc-aab-'))
  try {
    execFileSync('unzip', ['-qq', '-o', artifact, '*.so', '-d', dir])
    const walk = (d) =>
      readdirSync(d).flatMap((name) => {
        const full = join(d, name)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })
    const files = walk(dir).filter((f) => f.endsWith('.so'))
    const bad = []
    for (const file of files) {
      const buf = readFileSync(file)
      if (buf.length < 64 || buf.readUInt32BE(0) !== 0x7f454c46) continue
      const is64 = buf[4] === 2
      const le = buf[5] === 1
      if (!is64) continue // 16 KB is a 64-bit-device requirement
      const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
      const u64 = (o) => (le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o))
      const phoff = Number(u64(0x20))
      const phentsize = u16(0x36)
      const phnum = u16(0x38)
      let worst = null
      for (let i = 0; i < phnum; i++) {
        const off = phoff + i * phentsize
        if (off + phentsize > buf.length) break
        const type = le ? buf.readUInt32LE(off) : buf.readUInt32BE(off)
        if (type !== 1) continue // PT_LOAD
        const align = Number(u64(off + 0x30))
        if (worst === null || align < worst) worst = align
      }
      if (worst !== null && worst < REQUIRED_ALIGNMENT) {
        bad.push(`${relative(dir, file)} (p_align ${worst})`)
      }
    }
    if (bad.length) {
      for (const b of bad) fail(`not 16 KB aligned: ${b}`)
    } else {
      pass(`all ${files.length} native libraries are 16 KB aligned`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('')
process.exit(failed ? 1 : 0)
