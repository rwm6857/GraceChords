#!/usr/bin/env node
// Export the shippable devotional content artifacts.
//
//   node analysis/export_content.mjs
//
// Outputs into analysis/out/dist/:
//   month/{MM}.json   twelve files, every day key present
//   manifest.json     per-month sha256 + byte size, and the content version
//   README.md         written separately by hand (not regenerated here)
//
// R2 is the source of truth; the mobile app also ships these files as a bundled
// baseline. Web and Studio will read the same artifacts, so nothing
// platform-specific may leak into the format.
//
// EVERYTHING the client needs is precomputed. No client parses markup, derives
// a slug, builds an excerpt, or decides display order.
//
// Deterministic: no Math.random, and no timestamp unless one is injected via
// DEVOTIONAL_GENERATED_AT (see below). Byte-identical across runs, so a rebuild
// that changes no content produces no new hashes and costs no downloads.
//
// Does NOT upload. Upload is manual via wrangler — see dist/README.md.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVerseReference, bookNumberToName } from '../packages/core/src/songs/verseRef.js'
import { blockToPlain } from './lib/blocks.mjs'
import { loadAuthored, mergeAuthored } from './lib/authored.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const DIST = join(OUT, 'dist')
const AUTHORED_DIR = join(HERE, '..', 'content', 'devotionals')

/** Artifact schema version — must match DEVOTIONAL_SCHEMA in packages/core. */
const SCHEMA_VERSION = 1
/** Target excerpt length, cut back to a word boundary. */
const EXCERPT_CHARS = 160
/** Max devotionals per day. */
const MAX_PER_DAY = 2

/**
 * A build timestamp makes output non-deterministic, which the hard constraints
 * forbid. So it is opt-in: unset by default (null in the manifest), injectable
 * for a release build that wants provenance. Sync never reads it — staleness is
 * decided by per-month content hashes.
 */
const GENERATED_AT = process.env.DEVOTIONAL_GENERATED_AT || null

const schedule = JSON.parse(await readFile(join(OUT, 'schedule.json'), 'utf8'))
const devotionals = JSON.parse(await readFile(join(OUT, 'devotionals.json'), 'utf8'))
const plan = JSON.parse(await readFile(join(HERE, '../packages/core/src/bible/mcheyne.plan.json'), 'utf8'))
const devByKey = new Map(devotionals.map((d) => [d.key, d]))

const pad = (n) => String(n).padStart(2, '0')
const problems = []

// ---------------------------------------------------------------------------
// Readings, and where each chapter sits in the day's reading order
// ---------------------------------------------------------------------------

/**
 * A day's reading slots as displayed (`Psalms 119:145-176`), plus a map from
 * `Book Chapter` to its position in that list. Display order follows the
 * reading order, so a devotional on the day's first reading comes first.
 */
function readingsFor(entry) {
  const labels = []
  const position = new Map()
  entry.readings.forEach((r, slotIndex) => {
    const book = bookNumberToName(r.book)
    labels.push(`${book} ${r.ref}`)
    const parsed = parseVerseReference(`${book} ${r.ref}`)
    if (parsed.error || !parsed.segments) return
    const chapters = [...new Set(parsed.segments.map((s) => s.chapter))]
    chapters.forEach((chapter, within) => {
      const key = `${book} ${chapter}`
      if (!position.has(key)) position.set(key, slotIndex * 100 + within)
    })
  })
  return { labels, position }
}

// ---------------------------------------------------------------------------
// Precomputed fields
// ---------------------------------------------------------------------------

/** `Deuteronomy 33:27` → `deuteronomy-33-27`. */
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** First ~160 chars of the first prose block, cut at a word boundary. */
function excerptOf(bodyBlocks) {
  const first = bodyBlocks.find((b) => b.type === 'p')
  const text = (first ? blockToPlain(first) : '').replace(/\s+/g, ' ').trim()
  if (text.length <= EXCERPT_CHARS) return text
  const cut = text.slice(0, EXCERPT_CHARS)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > EXCERPT_CHARS * 0.5 ? space : EXCERPT_CHARS).replace(/[,;:.—-]+$/, '')}…`
}

/**
 * The slug comes from the MATCHED reference, not the first reference on the
 * record: two entries carry several references each, and only the matched one
 * describes why this devotional is on this day.
 */
function toRecord(dev, match) {
  const reference = match?.reference || dev.reference
  const bodyBlocks = dev.bodyBlocks
  return {
    id: dev.key,
    slug: slugify(reference),
    author: dev.author,
    sourceWork: dev.sourceWork,
    reference,
    matchedChapter: match?.chapter ?? null,
    coreText: dev.coreText,
    excerpt: excerptOf(bodyBlocks),
    timeHint: dev.timeHint ?? null,
    bodyBlocks,
  }
}

// ---------------------------------------------------------------------------
// Build the day map
// ---------------------------------------------------------------------------

const dayDevotionals = new Map()
const dayMeta = new Map()

for (const entry of plan) {
  const dayKey = `${entry.mmdd.slice(0, 2)}-${entry.mmdd.slice(2)}`
  const { labels, position } = readingsFor(entry)
  const slot = schedule[dayKey]
  if (!slot) { problems.push(`${dayKey}: absent from schedule.json`); continue }

  const records = (slot.matches ?? []).map((match) => {
    const dev = devByKey.get(match.devotional)
    if (!dev) { problems.push(`${dayKey}: unknown devotional ${match.devotional}`); return null }
    return toRecord(dev, match)
  }).filter(Boolean)

  dayDevotionals.set(dayKey, records)
  dayMeta.set(dayKey, { readings: labels, position, scheduleState: slot.state })
}

// ---------------------------------------------------------------------------
// Merge hand-authored content
// ---------------------------------------------------------------------------

const authored = await loadAuthored(AUTHORED_DIR)
for (const e of authored.errors) problems.push(e)

const authoredRecords = authored.entries.map((e) => ({
  ...e,
  slug: slugify(e.reference),
  excerpt: excerptOf(e.bodyBlocks),
  timeHint: null,
}))
const mergeReport = mergeAuthored(dayDevotionals, authoredRecords, MAX_PER_DAY)
for (const c of mergeReport.collisions) problems.push(c)

// ---------------------------------------------------------------------------
// Order, then assemble month files
// ---------------------------------------------------------------------------

for (const [dayKey, list] of dayDevotionals) {
  const { position } = dayMeta.get(dayKey)
  // Sort by where the matched chapter falls in the day's reading list.
  // Deliberately NOT by timeHint: it is null for the large majority and is a
  // vestige of the abandoned morning/evening structure.
  list.sort((a, b) => {
    const pa = position.get(a.matchedChapter ?? '') ?? Number.MAX_SAFE_INTEGER
    const pb = position.get(b.matchedChapter ?? '') ?? Number.MAX_SAFE_INTEGER
    return pa - pb || a.slug.localeCompare(b.slug)
  })
  // Slugs must be unique within a day. The same-verse hard exclusion in the
  // matcher guarantees this; if it ever fires, report rather than papering over
  // it with a numeric suffix.
  const slugs = list.map((d) => d.slug)
  if (new Set(slugs).size !== slugs.length) {
    problems.push(`${dayKey}: duplicate slugs within the day [${slugs.join(', ')}]`)
  }
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const monthFiles = new Map()

for (let m = 1; m <= 12; m += 1) {
  const days = {}
  for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d += 1) {
    // No 02-29 key: the plan has no such day and the leap day clamps to 02-28.
    if (m === 2 && d === 29) continue
    const dayKey = `${pad(m)}-${pad(d)}`
    const list = dayDevotionals.get(dayKey) ?? []
    const meta = dayMeta.get(dayKey)
    const state = list.length === 2 ? 'two' : list.length === 1 ? 'one' : 'open'
    if (meta && !authoredRecords.length && state !== meta.scheduleState) {
      problems.push(`${dayKey}: state "${state}" disagrees with schedule.json "${meta.scheduleState}"`)
    }
    days[dayKey] = { state, readings: meta?.readings ?? [], devotionals: list }
  }
  monthFiles.set(pad(m), { month: m, schemaVersion: SCHEMA_VERSION, days })
}

// ---------------------------------------------------------------------------
// Hash, then write
// ---------------------------------------------------------------------------

const sha = (s) => createHash('sha256').update(s).digest('hex')

const bodies = new Map()
for (const [key, content] of monthFiles) {
  bodies.set(key, JSON.stringify(content) + '\n')
}
// The content version fingerprints all twelve months, so it changes if and only
// if some content changed. It appears in every month path, which makes month
// objects immutable and removes the need to ever invalidate a cache.
const contentVersion = sha([...bodies.keys()].sort().map((k) => sha(bodies.get(k))).join('')).slice(0, 16)

// Clear only what this script generates. dist/README.md is hand-maintained
// documentation that happens to live alongside the output; wiping the whole
// directory would delete it on every build.
await rm(join(DIST, 'month'), { recursive: true, force: true })
await rm(join(DIST, 'manifest.json'), { force: true })
await mkdir(join(DIST, 'month'), { recursive: true })

const months = {}
for (const [key, body] of bodies) {
  await writeFile(join(DIST, 'month', `${key}.json`), body, 'utf8')
  months[key] = {
    file: `${contentVersion}/month/${key}.json`,
    hash: sha(body),
    bytes: Buffer.byteLength(body, 'utf8'),
  }
}

await writeFile(
  join(DIST, 'manifest.json'),
  JSON.stringify(
    { schemaVersion: SCHEMA_VERSION, contentVersion, generatedAt: GENERATED_AT, months },
    null,
    2
  ) + '\n',
  'utf8'
)

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const allDayKeys = []
const placedIds = []
const excerptLengths = []
let openDays = 0
let twoDays = 0

for (const [, content] of monthFiles) {
  for (const [dayKey, day] of Object.entries(content.days)) {
    allDayKeys.push(dayKey)
    if (day.state === 'open') openDays += 1
    if (day.state === 'two') twoDays += 1
    if (day.devotionals.length > MAX_PER_DAY) problems.push(`${dayKey}: ${day.devotionals.length} devotionals`)
    if (day.state === 'open' && day.devotionals.length) problems.push(`${dayKey}: open but non-empty`)
    if (!day.readings.length) problems.push(`${dayKey}: no readings`)
    for (const rec of day.devotionals) {
      placedIds.push(rec.id)
      excerptLengths.push(rec.excerpt.length)
      for (const field of ['id', 'slug', 'reference', 'coreText', 'excerpt', 'author', 'sourceWork']) {
        if (!rec[field]) problems.push(`${dayKey}/${rec.slug}: empty ${field}`)
      }
      if (!rec.bodyBlocks?.length) problems.push(`${dayKey}/${rec.slug}: no bodyBlocks`)
      if (JSON.stringify(rec.bodyBlocks).includes('_')) problems.push(`${dayKey}/${rec.slug}: raw underscore`)
    }
  }
}

if (allDayKeys.length !== 365) problems.push(`expected 365 day keys, got ${allDayKeys.length}`)
if (allDayKeys.includes('02-29')) problems.push('02-29 key must not exist')
const dupIds = [...new Set(placedIds.filter((id, i) => placedIds.indexOf(id) !== i))]
if (dupIds.length) problems.push(`devotional inlined more than once: ${dupIds.slice(0, 5).join(', ')}`)

excerptLengths.sort((a, b) => a - b)
const pct = (p) => excerptLengths[Math.floor((excerptLengths.length - 1) * p)]
const totalBytes = Object.values(months).reduce((a, m) => a + m.bytes, 0)

console.log(`Wrote ${DIST}`)
console.log()
console.log(`  schemaVersion:   ${SCHEMA_VERSION}`)
console.log(`  contentVersion:  ${contentVersion}`)
console.log(`  generatedAt:     ${GENERATED_AT ?? 'null (deterministic build)'}`)
console.log(`  day keys:        ${allDayKeys.length}  (${twoDays} two, ${365 - twoDays - openDays} one, ${openDays} open)`)
console.log(`  devotionals:     ${placedIds.length} inlined, each exactly once`)
console.log(`  authored:        ${mergeReport.merged.length} merged` +
  `${mergeReport.replaced.length ? `, ${mergeReport.replaced.length} replacing` : ''}` +
  `${authored.present ? '' : ' (content/devotionals/ absent)'}`)
console.log(`  excerpt chars:   min ${excerptLengths[0]}  p50 ${pct(0.5)}  p95 ${pct(0.95)}  max ${excerptLengths.at(-1)}`)
console.log(`  total bytes:     ${(totalBytes / 1024).toFixed(0)} KB  (largest month ${(Math.max(...Object.values(months).map((m) => m.bytes)) / 1024).toFixed(0)} KB)`)

for (const r of mergeReport.replaced) console.log(`  replaced: ${r}`)

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):`)
  for (const p of problems.slice(0, 25)) console.error(`  ${p}`)
  process.exit(1)
}
console.log('\nAll checks passed.')
