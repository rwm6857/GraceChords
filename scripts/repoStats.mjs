#!/usr/bin/env node
// Simple repository statistics: file count (all files), total lines and characters (text files)
// Excludes: docs/, node_modules/, .git/
// Usage: node scripts/repoStats.mjs [--json]

import fs from 'fs/promises'
import path from 'path'

const root = process.cwd()
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'docs'])

// Binary-ish extensions to skip for line/char counts
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.pdf', '.zip', '.gz', '.tar', '.bz2', '.7z', '.rar',
  '.mp3', '.wav', '.ogg', '.mp4', '.mov', '.avi', '.mkv',
  '.pptx', '.docx', '.xlsx', '.psd', '.sketch',
  '.bin', '.dylib', '.so'
])

// Treat everything else as text-like. If a text file contains odd bytes, counting still works.

/** @param {string} p */
function isIgnored(p) {
  const rel = path.relative(root, p)
  if (!rel) return false
  const parts = rel.split(path.sep)
  return parts.some((seg) => IGNORE_DIRS.has(seg))
}

/** @param {string} file */
function isBinaryByExt(file) {
  const ext = path.extname(file).toLowerCase()
  return BINARY_EXT.has(ext)
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (isIgnored(p)) continue
    if (e.isDirectory()) {
      yield* walk(p)
    } else if (e.isFile()) {
      yield p
    }
  }
}

async function countFile(file) {
  // For lines/chars, skip known binary types
  if (isBinaryByExt(file)) return { lines: 0, chars: 0 }
  try {
    const data = await fs.readFile(file)
    // Count newlines; handle empty files
    let lines = 0
    for (let i = 0; i < data.length; i++) if (data[i] === 0x0a) lines++
    // If file isn't empty and doesn't end with \n, count the last line
    if (data.length > 0 && data[data.length - 1] !== 0x0a) lines++
    return { lines, chars: data.length }
  } catch {
    // If unreadable, ignore for text stats
    return { lines: 0, chars: 0 }
  }
}

async function main() {
  const asJson = process.argv.includes('--json')
  let files = 0
  let lines = 0
  let chars = 0

  for await (const f of walk(root)) {
    files++
    const { lines: l, chars: c } = await countFile(f)
    lines += l
    chars += c
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ files, lines, chars }) + '\n')
  } else {
    console.log(`Files: ${files}`)
    console.log(`Lines (text files): ${lines}`)
    console.log(`Characters (text files): ${chars}`)
    console.log('\nNotes:')
    console.log('- Excludes docs/, node_modules/, and .git/')
    console.log('- Lines/characters include text-like files; common binary formats are skipped by extension')
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err))
  process.exit(1)
})

