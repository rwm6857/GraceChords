#!/usr/bin/env node
// Parse the 24 CCEL Morning & Evening HTML files in analysis/ingest/ into
// analysis/out/devotionals.json, then run a validation harness over the result.
//
//   node analysis/parse_me.mjs
//
// Deterministic and re-runnable from a clean out/. No network, no side effects
// beyond writing out/devotionals.json.
//
// SOURCE SHAPE (verified across all 24 files during recon)
// ---------------------------------------------------------
// The only tags in these files are <H2> and <pre>. No <i>/<em>/<b>, no HTML
// entities, no non-ASCII. Everything below is plain text inside one <pre>.
//
//   <H2>January AM</H2>
//   <pre>
//   * 01/01/AM                     <- entry delimiter, exact
//   (blank)
//   "core text, 1-3 hard-wrapped lines"
//   <~50 spaces>--Joshua 5:12      <- reference, RIGHT-PADDED
//   (blank)
//   <2-4 spaces>body paragraph, hard-wrapped to ~65 cols
//   ...
//
// Three source facts that drive the parsing rules:
//
//  1. `--` alone does NOT identify a reference. 739 lines start with `--`, but
//     only 735 are references; the other 4 are body prose using `--` as an
//     em-dash at a line start. Real references are right-padded to indent
//     38-56; the false positives sit at indent 0. Hence REF_MIN_INDENT.
//
//  2. Two entries carry MULTIPLE core text / reference pairs (07-12-AM has 3,
//     08-30-PM has 2). Singular `coreText`/`reference` hold the first; the full
//     set lives in `coreTexts`/`references`.
//
//  3. The body paragraph indent is USUALLY 2-4 spaces but is not reliable: six
//     entries use 2 or 4 instead of 3, and 09-28-AM's first body paragraph has
//     no indent at all. So the header/body boundary is anchored on the
//     reference cluster, not on indentation -- see findHeaderRefs().
//
// ITALICS: the transcription encodes emphasis as markdown-style underscores
// (`_gospel_ light`), and spans can straddle a hard-wrap. They are preserved
// byte-for-byte in `body`; `bodyPlain` is the same text with underscores
// removed. Nothing is silently mangled either way.

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toBodyBlocks, bodyBlocksToPlain } from './lib/blocks.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const INGEST = join(HERE, 'ingest')
const OUT = join(HERE, 'out')

/** Minimum leading spaces for a `--`-prefixed line to count as a reference. */
const REF_MIN_INDENT = 20
/** Leading spaces that mark a body paragraph's first line. */
const PARA_INDENT = new Set([2, 3, 4])

/** Provenance stamped on every record in this corpus. */
const AUTHOR = 'C. H. Spurgeon'
const SOURCE_WORK = 'Morning and Evening'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const errors = []
const stats = {
  hyphenJoins: 0,
  hyphenJoinSamples: [],
  emDashJoins: 0,
  proseBlocks: 0,
  verseBlocks: 0,
  midBlockParaSplits: 0,
  midBlockParaSamples: [],
  multiRefEntries: [],
  headerBlankLines: 0,
  timeHintMorning: 0,
  timeHintEvening: 0,
  timeHintAmbiguous: 0,
}

const indentOf = (line) => line.length - line.replace(/^ +/, '').length
const isRefLine = (line) =>
  line.trim().startsWith('--') && indentOf(line) >= REF_MIN_INDENT

/**
 * Join hard-wrapped lines into one line.
 *
 * An end-of-line hyphen in this transcription is a genuine hyphenated compound
 * that happens to break there (`self-aggrandizement`), NOT a syllable break --
 * so the lines are joined with no space and the hyphen is kept. Same for a
 * trailing `--` (em-dash). Everything else joins with a single space.
 */
function unwrap(lines, { count = false } = {}) {
  let out = ''
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!out) { out = line.trimStart(); continue }
    if (out.endsWith('--')) {
      if (count) stats.emDashJoins += 1
      out += line.trimStart()
    } else if (out.endsWith('-')) {
      if (count) {
        stats.hyphenJoins += 1
        const tail = out.slice(-24).trimStart()
        const head = line.trimStart().split(/\s/)[0]
        if (stats.hyphenJoinSamples.length < 80) {
          stats.hyphenJoinSamples.push(`${tail}|${head}`)
        }
      }
      out += line.trimStart()
    } else {
      out += ' ' + line.trimStart()
    }
  }
  return out
}

/** Split a run of non-blank lines into blocks; blank lines are the delimiter. */
function toBlocks(lines) {
  const blocks = []
  let cur = []
  for (const l of lines) {
    if (l.trim()) cur.push(l)
    else if (cur.length) { blocks.push(cur); cur = [] }
  }
  if (cur.length) blocks.push(cur)
  return blocks
}

/**
 * A block is a verse/hymn quotation if every one of its lines is indented.
 * Prose paragraphs give themselves away by wrapping back to column 0.
 *
 * The `>= 2 lines` clause protects two one-line prose sentences that happen to
 * sit alone at the paragraph indent (03-20-AM, 05-07-PM); the `minIndent >= 5`
 * clause lets a genuinely deep single line still count as verse.
 */
function isVerseBlock(block) {
  const indents = block.map(indentOf)
  const minIndent = Math.min(...indents)
  if (minIndent < 2) return false
  return block.length >= 2 || minIndent >= 5
}

/**
 * Within a prose block, a paragraph-indented line that isn't the first line
 * starts a new paragraph (the source occasionally omits the blank line).
 */
function splitProseParagraphs(block, key) {
  const paras = []
  let cur = [block[0]]
  for (const line of block.slice(1)) {
    if (PARA_INDENT.has(indentOf(line))) {
      paras.push(cur)
      cur = [line]
      stats.midBlockParaSplits += 1
      if (stats.midBlockParaSamples.length < 20) {
        stats.midBlockParaSamples.push(`${key}: ${line.trim().slice(0, 60)}`)
      }
    } else cur.push(line)
  }
  paras.push(cur)
  return paras
}

/** Strip the block's common leading indent, preserving relative indentation. */
function dedent(block) {
  const minIndent = Math.min(...block.map(indentOf))
  return block.map((l) => l.slice(minIndent).trimEnd()).join('\n')
}

function parseEntryBody(lines, key) {
  const blocks = []
  for (const block of toBlocks(lines)) {
    if (isVerseBlock(block)) {
      stats.verseBlocks += 1
      blocks.push({ type: 'verse', text: dedent(block) })
    } else {
      for (const para of splitProseParagraphs(block, key)) {
        stats.proseBlocks += 1
        blocks.push({ type: 'prose', text: unwrap(para, { count: true }) })
      }
    }
  }
  return blocks
}

/**
 * Decide which reference lines belong to the header.
 *
 * Indentation cannot mark the header/body boundary: 09-28-AM's first body
 * paragraph sits at column 0, and paragraph indents elsewhere vary between 2
 * and 4. What IS reliable is spacing. A header core text is at most a few
 * hard-wrapped lines followed immediately by its reference, so consecutive
 * header references are never more than a handful of lines apart. A body,
 * by contrast, runs for dozens of lines.
 *
 * So: take the first reference, then keep absorbing later references only
 * while they are separated by at most MAX_CORE_TEXT_LINES non-blank lines.
 * This admits the two genuine multi-reference entries (07-12-AM, 08-30-PM)
 * and excludes everything else.
 */
const MAX_CORE_TEXT_LINES = 4
function findHeaderRefs(lines) {
  const refIdx = []
  for (let k = 0; k < lines.length; k += 1) if (isRefLine(lines[k])) refIdx.push(k)
  if (!refIdx.length) return []
  const header = [refIdx[0]]
  for (let k = 1; k < refIdx.length; k += 1) {
    let between = 0
    for (let n = refIdx[k - 1] + 1; n < refIdx[k]; n += 1) if (lines[n].trim()) between += 1
    if (between > MAX_CORE_TEXT_LINES) break
    header.push(refIdx[k])
  }
  return header
}

function parseEntry({ key, month, day, slot, lines, file }) {
  // --- header / body boundary -------------------------------------------
  let i = 0
  while (i < lines.length && !lines[i].trim()) i += 1

  const headerRefs = findHeaderRefs(lines)
  if (!headerRefs.length) {
    errors.push(`${key} (${file}): no reference line found`)
    return null
  }

  let bodyStart = headerRefs.at(-1) + 1
  while (bodyStart < lines.length && !lines[bodyStart].trim()) bodyStart += 1
  if (bodyStart >= lines.length) {
    errors.push(`${key} (${file}): no body after the last header reference`)
    return null
  }

  // A right-indented reference inside the body means the boundary is wrong.
  const strayRefs = lines.slice(bodyStart).filter(isRefLine)
  if (strayRefs.length) {
    errors.push(`${key} (${file}): reference-shaped line inside body: ${strayRefs[0].trim()}`)
  }

  // --- header: pair each core text with the reference that follows it ----
  const coreTexts = []
  const references = []
  let ctBuf = []
  for (const line of lines.slice(i, bodyStart)) {
    if (!line.trim()) continue
    if (isRefLine(line)) {
      if (!ctBuf.length) {
        errors.push(`${key} (${file}): reference with no preceding core text: ${line.trim()}`)
      }
      coreTexts.push(stripQuotes(unwrap(ctBuf)))
      references.push(line.trim().replace(/^--\s*/, '').trim())
      ctBuf = []
    } else ctBuf.push(line)
  }
  if (ctBuf.length) {
    errors.push(`${key} (${file}): dangling core text with no reference: ${unwrap(ctBuf).slice(0, 60)}`)
  }
  if (references.length > 1) stats.multiRefEntries.push(`${key} (${references.length})`)

  const blocks = parseEntryBody(lines.slice(bodyStart), key)
  const body = blocks.map((b) => b.text).join('\n\n')
  const bodyPlain = body.replace(/_/g, '')

  return {
    month,
    day,
    slot,
    key,
    // Provenance. Present on every record from the start so devotional content
    // from other sources can be ingested alongside these without a migration --
    // the days this corpus cannot fill will be filled from elsewhere.
    author: AUTHOR,
    sourceWork: SOURCE_WORK,
    coreText: coreTexts[0] ?? '',
    reference: references[0] ?? '',
    coreTexts,
    references,
    body,
    bodyPlain,
    timeHint: timeHintOf(`${coreTexts.join(' ')} ${bodyPlain}`),
    blocks,
    // Offline-parsed body: paragraphs and verse stanzas with italic spans
    // already resolved, so no client ships a markup parser. `body` and
    // `bodyPlain` are unchanged — this is purely additive.
    bodyBlocks: toBodyBlocks(blocks),
  }
}

// Time-of-day hint. These phrases constrain the HOUR at which a devotional
// reads naturally, not the DATE -- they are NOT scheduling anchors (see
// analysis/scan_anchors.mjs). The schedule uses the hint only to order the two
// devotionals within a day: morning-hinted first, evening-hinted second.
//
// Deliberately excludes `this day` / `to-day`, which mean "today, whatever day
// that is" and are genuinely incidental. Also excludes `morning's text` /
// `evening's text`: in a PM entry "morning's text" is a BACKWARD reference and
// would invert the hint.
const MORNING_HINT = /\bthis morning\b/i
const EVENING_HINT = /\b(this evening|to-night|tonight|at eventide)\b/i

/**
 * `'morning'`, `'evening'`, or null. An entry carrying both signals -- e.g. a
 * PM entry that opens by referring back to its morning partner -- resolves to
 * null rather than guessing wrong.
 */
function timeHintOf(text) {
  const morning = MORNING_HINT.test(text)
  const evening = EVENING_HINT.test(text)
  if (morning && evening) { stats.timeHintAmbiguous += 1; return null }
  if (morning) { stats.timeHintMorning += 1; return 'morning' }
  if (evening) { stats.timeHintEvening += 1; return 'evening' }
  return null
}

/** Drop the wrapping double quotes around a core text, keeping inner ones. */
function stripQuotes(text) {
  let out = text.trim()
  if (out.startsWith('"')) out = out.slice(1)
  if (out.endsWith('"')) out = out.slice(0, -1)
  return out.trim()
}

// ---------------------------------------------------------------------------
// Read + split the 24 files
// ---------------------------------------------------------------------------

const files = (await readdir(INGEST))
  .filter((f) => /^ME\d{2}(AM|PM)\.html$/.test(f))
  .sort()

if (files.length !== 24) {
  console.error(`Expected 24 files in ${INGEST}, found ${files.length}. Run: node analysis/fetch_me.mjs`)
  process.exit(1)
}

const entries = []
for (const file of files) {
  const html = await readFile(join(INGEST, file), 'utf8')
  const [, mmStr, fileSlot] = file.match(/^ME(\d{2})(AM|PM)\.html$/)
  const fileMonth = Number(mmStr)

  // Cross-check the <H2> header against the filename.
  const h2 = html.match(/<H2>(.*?)<\/H2>/i)?.[1]?.trim()
  const expectedH2 = `${MONTH_NAMES[fileMonth - 1]} ${fileSlot}`
  if (h2 !== expectedH2) {
    errors.push(`${file}: <H2> is "${h2}", filename implies "${expectedH2}"`)
  }

  const open = html.toLowerCase().indexOf('<pre>')
  const close = html.toLowerCase().lastIndexOf('</pre>')
  if (open === -1 || close === -1) {
    errors.push(`${file}: no <pre> block found`)
    continue
  }
  const lines = html.slice(open + 5, close).split('\n')

  let cur = null
  let buf = []
  const flush = () => { if (cur) entries.push({ ...cur, lines: buf, file }) }

  for (const line of lines) {
    const m = line.match(/^\* (\d{2})\/(\d{2})\/(AM|PM)\s*$/)
    if (m) {
      flush()
      const [, mm, dd, slot] = m
      const month = Number(mm)
      // Filename is the authority; a mismatch with the in-file marker is a
      // hard error, not a warning.
      if (month !== fileMonth) {
        errors.push(`${file}: marker "* ${mm}/${dd}/${slot}" has month ${mm}, file implies ${mmStr}`)
      }
      if (slot !== fileSlot) {
        errors.push(`${file}: marker "* ${mm}/${dd}/${slot}" has slot ${slot}, file implies ${fileSlot}`)
      }
      cur = { key: `${mm}-${dd}-${slot}`, month, day: Number(dd), slot }
      buf = []
    } else if (cur) buf.push(line)
  }
  flush()
}

const records = entries.map(parseEntry).filter(Boolean)

// ---------------------------------------------------------------------------
// Validation harness
// ---------------------------------------------------------------------------

const report = []
const say = (s) => { report.push(s); console.log(s) }
let failed = 0
const check = (ok, label, detail = '') => {
  if (ok) say(`  PASS  ${label}`)
  else { failed += 1; say(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`) }
}

say(`\nParsed ${records.length} entries from ${files.length} files.\n`)
say('Validation')

check(records.length === 732, `entry count is 732 (got ${records.length})`)

const keys = records.map((r) => r.key)
const dupKeys = keys.filter((k, idx) => keys.indexOf(k) !== idx)
check(dupKeys.length === 0, 'no duplicate keys', dupKeys.slice(0, 10).join(', '))

// Every calendar date, including Feb 29, with exactly 2 slots.
const byDate = new Map()
for (const r of records) {
  const d = `${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`
  byDate.set(d, (byDate.get(d) ?? 0) + 1)
}
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const expectedDates = []
for (let m = 1; m <= 12; m += 1) {
  for (let d = 1; d <= DAYS_IN_MONTH[m - 1]; d += 1) {
    expectedDates.push(`${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
}
const missingDates = expectedDates.filter((d) => !byDate.has(d))
const extraDates = [...byDate.keys()].filter((d) => !expectedDates.includes(d))
const wrongCount = [...byDate.entries()].filter(([, n]) => n !== 2)

check(byDate.size === 366, `366 distinct dates incl. Feb 29 (got ${byDate.size})`)
check(missingDates.length === 0, 'no missing dates', missingDates.slice(0, 10).join(', '))
check(extraDates.length === 0, 'no unexpected dates', extraDates.slice(0, 10).join(', '))
check(wrongCount.length === 0, 'exactly 2 entries per date',
  wrongCount.slice(0, 10).map(([d, n]) => `${d}=${n}`).join(', '))

const emptyCore = records.filter((r) => !r.coreText.trim())
const emptyRef = records.filter((r) => !r.reference.trim())
const emptyBody = records.filter((r) => !r.body.trim())
check(emptyCore.length === 0, 'every entry has a non-empty coreText', emptyCore.map((r) => r.key).join(', '))
check(emptyRef.length === 0, 'every entry has a non-empty reference', emptyRef.map((r) => r.key).join(', '))
check(emptyBody.length === 0, 'every entry has a non-empty body', emptyBody.map((r) => r.key).join(', '))

// A leaked delimiter means two devotionals silently merged.
const leaked = records.filter((r) => /\*\s*\d{2}\/\d{2}\//.test(r.body))
check(leaked.length === 0, 'no unconsumed "* NN/NN/" marker in any body',
  leaked.map((r) => r.key).join(', '))

check(errors.length === 0, 'no filename/marker/header errors',
  errors.slice(0, 20).join('\n          '))

// bodyBlocks must reassemble to exactly bodyPlain. This is THE guard against a
// block or span parser silently dropping a sentence: a mismatch is a hard
// error, not a warning, because the loss would be invisible on screen.
const roundTripFails = records.filter((r) => bodyBlocksToPlain(r.bodyBlocks) !== r.bodyPlain)
check(roundTripFails.length === 0,
  `bodyBlocks round-trips to bodyPlain for all ${records.length} entries`,
  roundTripFails.slice(0, 5).map((r) => r.key).join(', '))

const blockTypes = new Map()
let totalSpans = 0
let italicSpans = 0
let verseLines = 0
for (const r of records) {
  for (const b of r.bodyBlocks) {
    blockTypes.set(b.type, (blockTypes.get(b.type) ?? 0) + 1)
    if (b.type === 'verse') {
      verseLines += b.lines.length
      for (const line of b.lines) {
        totalSpans += line.spans.length
        italicSpans += line.spans.filter((s) => s.i).length
      }
    } else {
      totalSpans += b.spans.length
      italicSpans += b.spans.filter((s) => s.i).length
    }
  }
}
// A verse block must never be collapsed into a single reflowed line: the source
// stanza's line count has to survive into the artifact.
const flattenedVerse = []
for (const r of records) {
  const sourceVerse = r.blocks.filter((b) => b.type === 'verse')
  const outVerse = r.bodyBlocks.filter((b) => b.type === 'verse')
  sourceVerse.forEach((src, i) => {
    const expected = src.text.split('\n').length
    if (outVerse[i]?.lines.length !== expected) flattenedVerse.push(r.key)
  })
}
check(flattenedVerse.length === 0, 'verse blocks keep their lines discrete',
  [...new Set(flattenedVerse)].slice(0, 5).join(', '))

// Body length distribution -- a short body almost always means a parse failure.
const lens = records.map((r) => ({ key: r.key, n: r.body.length })).sort((a, b) => a.n - b.n)
const pct = (p) => lens[Math.floor((lens.length - 1) * p)].n
const mean = lens.reduce((a, b) => a + b.n, 0) / lens.length
const sd = Math.sqrt(lens.reduce((a, b) => a + (b.n - mean) ** 2, 0) / lens.length)
const lowOutliers = lens.filter((l) => l.n < mean - 3 * sd)
const highOutliers = lens.filter((l) => l.n > mean + 3 * sd)

say('\nBody length distribution (characters)')
say(`  min ${lens[0].n} (${lens[0].key})   p05 ${pct(0.05)}   p25 ${pct(0.25)}   median ${pct(0.5)}   p75 ${pct(0.75)}   p95 ${pct(0.95)}   max ${lens.at(-1).n} (${lens.at(-1).key})`)
say(`  mean ${mean.toFixed(0)}   sd ${sd.toFixed(0)}`)
say(`  shortest 5: ${lens.slice(0, 5).map((l) => `${l.key}=${l.n}`).join(', ')}`)
say(`  longest 5:  ${lens.slice(-5).map((l) => `${l.key}=${l.n}`).join(', ')}`)
say(`  low outliers (< mean-3sd): ${lowOutliers.length ? lowOutliers.map((l) => `${l.key}=${l.n}`).join(', ') : 'none'}`)
say(`  high outliers (> mean+3sd): ${highOutliers.length ? highOutliers.map((l) => `${l.key}=${l.n}`).join(', ') : 'none'}`)

say('\nParse statistics')
say(`  hyphen joins (end-of-line "-" kept, lines joined): ${stats.hyphenJoins}`)
say(`  em-dash joins (end-of-line "--"): ${stats.emDashJoins}`)
say(`  prose paragraphs: ${stats.proseBlocks}`)
say(`  verse/hymn blocks preserved: ${stats.verseBlocks}`)
say(`  mid-block paragraph splits (no blank line in source): ${stats.midBlockParaSplits}`)
say(`  entries with >1 core text/reference pair: ${stats.multiRefEntries.join(', ') || 'none'}`)
say(`  italic markers preserved: ${records.reduce((a, r) => a + (r.body.match(/_/g)?.length ?? 0), 0)} underscores`)
say(`  timeHint morning / evening / ambiguous-so-null: ${stats.timeHintMorning} / ${stats.timeHintEvening} / ${stats.timeHintAmbiguous}`)

say('\nbodyBlocks')
for (const [type, n] of [...blockTypes.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  type "${type}": ${n}`)
}
say(`  verse lines: ${verseLines}`)
say(`  spans: ${totalSpans} total, ${italicSpans} italic`)
say(`  round-trip to bodyPlain: ${records.length - roundTripFails.length}/${records.length} exact`)

say('\nHyphen joins, for spot-checking (tail|head of each join):')
for (const s of stats.hyphenJoinSamples) say(`  ${s}`)
if (stats.midBlockParaSamples.length) {
  say('\nMid-block paragraph splits, for spot-checking:')
  for (const s of stats.midBlockParaSamples) say(`  ${s}`)
}

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'devotionals.json'), JSON.stringify(records, null, 2) + '\n', 'utf8')
await writeFile(join(OUT, 'parse-log.txt'), report.join('\n') + '\n', 'utf8')
say(`\nWrote ${join(OUT, 'devotionals.json')} (${records.length} records)`)

if (failed) {
  console.error(`\n${failed} validation check(s) FAILED.`)
  process.exit(1)
}
say('All validation checks passed.')
