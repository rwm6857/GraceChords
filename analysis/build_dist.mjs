#!/usr/bin/env node
// Build the shippable devotional artifacts from the analysis output.
//
//   node analysis/build_dist.mjs
//
// Outputs:
//   out/dist/month/01.json … 12.json   one file per month, keyed MM-DD
//   out/dist/manifest.json             per-month content hashes
//
// These are the ONLY files the clients read. Everything the UI needs is
// precomputed here so no client derives anything at runtime:
//
//   * `slug`      — stable, globally unique, URL-safe deep-link id
//   * `excerpt`   — card summary, plain text
//   * `bodyBlocks`— body already parsed into paragraphs / verse stanzas with
//                   italic spans resolved, so no client ships a markdown parser
//   * display order — array order is the day's reading order
//
// Deterministic: no timestamps, no Math.random. Byte-identical across runs, so
// a rebuild that changes no content produces no new hashes and costs no
// downloads.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const DIST = join(OUT, 'dist')

/** Artifact schema version — must match DEVOTIONAL_SCHEMA in packages/core. */
const SCHEMA = 1
/** Target length for a card excerpt, trimmed to a word boundary. */
const EXCERPT_CHARS = 150

const schedule = JSON.parse(await readFile(join(OUT, 'schedule.json'), 'utf8'))
const devotionals = JSON.parse(await readFile(join(OUT, 'devotionals.json'), 'utf8'))
const devByKey = new Map(devotionals.map((d) => [d.key, d]))

// ---------------------------------------------------------------------------
// Italic spans
// ---------------------------------------------------------------------------

/**
 * Split text on the transcription's markdown-style `_italic_` markers.
 *
 * `04-14-PM` contains a doubled underscore (`__well upon divine`) — a genuine
 * defect in the CCEL transcription and the only entry with unbalanced markers.
 * Collapsing runs of underscores to one rebalances it, which is why the toggle
 * below can stay naive.
 */
function toSpans(text) {
  const parts = String(text).replace(/_{2,}/g, '_').split('_')
  const spans = []
  parts.forEach((t, i) => {
    if (!t) return
    spans.push(i % 2 ? { t, i: true } : { t })
  })
  return spans.length ? spans : [{ t: '' }]
}

const spansToPlain = (spans) => spans.map((s) => s.t).join('')

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function toBodyBlocks(blocks) {
  const out = []
  for (const b of blocks) {
    if (b.type === 'verse') {
      out.push({ type: 'verse', lines: b.text.split('\n').map((line) => toSpans(line.trim())) })
    } else {
      out.push({ type: 'p', spans: toSpans(b.text) })
    }
  }
  return out
}

/** First paragraph, trimmed to a word boundary. Plain text — cards get no markup. */
function toExcerpt(bodyBlocks) {
  const firstProse = bodyBlocks.find((b) => b.type === 'p')
  const text = firstProse ? spansToPlain(firstProse.spans).trim() : ''
  if (text.length <= EXCERPT_CHARS) return text
  const cut = text.slice(0, EXCERPT_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : EXCERPT_CHARS).replace(/[,;:.—-]+$/, '')}…`
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Globally unique, stable slug from the entry's own reference — so a deep link
 * reads as the scripture it is about. Several entries share a reference (two are
 * even on the same verse), so collisions get a numeric suffix. Assignment walks
 * days in calendar order and entries in array order, both fixed, so a given
 * entry keeps its slug across rebuilds.
 */
const slugCounts = new Map()
function assignSlug(reference) {
  const base = slugify(reference) || 'devotional'
  const n = (slugCounts.get(base) ?? 0) + 1
  slugCounts.set(base, n)
  return n === 1 ? base : `${base}-${n}`
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const pad = (n) => String(n).padStart(2, '0')

const monthDays = new Map(Array.from({ length: 12 }, (_, i) => [pad(i + 1), {}]))

// February 29 is deliberately absent: the plan has no such day and
// `devotionalDayKey` in packages/core clamps it to 02-28, so a 02-29 key would
// be unreachable. Days 01-01 … 12-31 in calendar order fixes slug assignment.
for (let m = 1; m <= 12; m += 1) {
  const days = monthDays.get(pad(m))
  for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d += 1) {
    if (m === 2 && d === 29) continue
    const dayKey = `${pad(m)}-${pad(d)}`
    const slot = schedule[dayKey]
    days[dayKey] = (slot?.matches ?? []).map((match) => {
      const dev = devByKey.get(match.devotional)
      const bodyBlocks = toBodyBlocks(dev.blocks)
      return {
        slug: assignSlug(dev.reference),
        reference: dev.reference,
        coreText: dev.coreText,
        excerpt: toExcerpt(bodyBlocks),
        author: dev.author,
        sourceWork: dev.sourceWork,
        matchedChapter: match.chapter ?? null,
        bodyBlocks,
      }
    })
  }
}

await rm(DIST, { recursive: true, force: true })
await mkdir(join(DIST, 'month'), { recursive: true })

const months = {}
let totalBytes = 0
let totalDevotionals = 0

for (const [key, days] of monthDays) {
  // The month's own version is the hash of its content, so it is stable across
  // rebuilds and identical to the manifest entry the client compares against.
  const content = { month: Number(key), days }
  const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex')
  const body = JSON.stringify({ month: Number(key), version: contentHash, days }, null, 0) + '\n'
  const bytes = Buffer.byteLength(body, 'utf8')
  const hash = createHash('sha256').update(body).digest('hex')

  await writeFile(join(DIST, 'month', `${key}.json`), body, 'utf8')
  months[key] = { file: `month/${key}.json`, hash, bytes }
  totalBytes += bytes
  totalDevotionals += Object.values(days).reduce((a, v) => a + v.length, 0)
}

await writeFile(
  join(DIST, 'manifest.json'),
  JSON.stringify({ schema: SCHEMA, months }, null, 2) + '\n',
  'utf8'
)

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const problems = []
const allSlugs = []
let dayCount = 0
let openCount = 0
for (const [, days] of monthDays) {
  for (const [dayKey, list] of Object.entries(days)) {
    dayCount += 1
    if (!list.length) openCount += 1
    if (list.length > 2) problems.push(`${dayKey}: ${list.length} devotionals`)
    for (const d of list) {
      allSlugs.push(d.slug)
      if (!d.reference || !d.coreText || !d.bodyBlocks.length) problems.push(`${dayKey}/${d.slug}: empty field`)
      if (!d.excerpt) problems.push(`${dayKey}/${d.slug}: empty excerpt`)
      if (JSON.stringify(d.bodyBlocks).includes('_')) problems.push(`${dayKey}/${d.slug}: raw underscore survived`)
    }
  }
}
const dupSlugs = [...new Set(allSlugs.filter((s, i) => allSlugs.indexOf(s) !== i))]
if (dupSlugs.length) problems.push(`duplicate slugs: ${dupSlugs.slice(0, 5).join(', ')}`)
if (dayCount !== 365) problems.push(`expected 365 days, got ${dayCount}`)
if (monthDays.get('02')['02-29']) problems.push('02-29 key should not exist')

const verseBlocks = [...monthDays.values()]
  .flatMap((days) => Object.values(days).flat())
  .flatMap((d) => d.bodyBlocks)
  .filter((b) => b.type === 'verse').length

console.log(`Wrote ${DIST}`)
console.log()
console.log(`  months:            12`)
console.log(`  days:              ${dayCount} (${openCount} open)`)
console.log(`  devotionals:       ${totalDevotionals}`)
console.log(`  unique slugs:      ${new Set(allSlugs).size}`)
console.log(`  verse blocks:      ${verseBlocks}`)
console.log(`  total month bytes: ${(totalBytes / 1024).toFixed(0)} KB`)
console.log(`  largest month:     ${Math.max(...Object.values(months).map((m) => m.bytes)) / 1024 | 0} KB`)

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):`)
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
