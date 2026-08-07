#!/usr/bin/env node
// Normalize both datasets into a shared { bookNumber, chapter } space, join
// them, and emit analysis/out/refs.csv + analysis/out/coverage-report.md.
//
//   node analysis/normalize_refs.mjs   (run parse_me.mjs first)
//
// Both sides are parsed with the repo's OWN reference parser
// (packages/core/src/songs/verseRef.js) rather than a reimplementation, so the
// analysis shares one book/reference vocabulary with the shipped app. If that
// parser has a quirk, this analysis reproduces it instead of papering over it.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVerseReference, bookNumberToName, BOOKS } from '../packages/core/src/songs/verseRef.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const PLAN_PATH = join(HERE, '../packages/core/src/bible/mcheyne.plan.json')

const devotionals = JSON.parse(await readFile(join(OUT, 'devotionals.json'), 'utf8'))
const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8'))

const chapKey = (bookNumber, chapter) => `${bookNumber}:${chapter}`
const pad = (n) => String(n).padStart(2, '0')

// ---------------------------------------------------------------------------
// Side A: devotional references
// ---------------------------------------------------------------------------

/**
 * One reference in the corpus uses a period where every other uses a colon
 * (`Luke 4.18`). The repo parser rejects it outright, so it is normalized here
 * rather than being dropped. This is the ONLY textual fixup applied.
 */
const PERIOD_FIXUPS = []
function preNormalize(ref) {
  const fixed = ref.replace(/(\d)\.(\d)/g, '$1:$2')
  if (fixed !== ref) PERIOD_FIXUPS.push(`${ref} -> ${fixed}`)
  return fixed
}

const refRows = []      // one row per reference (multi-reference entries emit several)
const unparsed = []
const devByChapter = new Map()   // "book:chapter" -> Set of devotional keys

for (const d of devotionals) {
  for (const rawRef of d.references) {
    const parsed = parseVerseReference(preNormalize(rawRef))
    if (parsed.error || parsed.bookNumber == null || !parsed.segments?.length) {
      unparsed.push({ key: d.key, ref: rawRef, error: parsed.error ?? 'no segments' })
      continue
    }
    for (const seg of parsed.segments) {
      const verse = seg.ranges?.[0]?.start ?? null
      refRows.push({
        key: d.key,
        slot: d.slot,
        book: parsed.book,
        bookNumber: parsed.bookNumber,
        chapter: seg.chapter,
        verse,
        rawRef,
      })
      const k = chapKey(parsed.bookNumber, seg.chapter)
      if (!devByChapter.has(k)) devByChapter.set(k, new Set())
      devByChapter.get(k).add(d.key)
    }
  }
}

// ---------------------------------------------------------------------------
// Side B: M'Cheyne plan chapters
// ---------------------------------------------------------------------------

const planUnparsed = []
/** Chapters a reading slot expands to. `12:1-13:1` yields chapters 12 AND 13. */
function planChapters(reading) {
  const bookName = bookNumberToName(reading.book)
  const parsed = parseVerseReference(`${bookName} ${reading.ref}`)
  if (parsed.error || !parsed.segments?.length) {
    planUnparsed.push(`${bookName} ${reading.ref}: ${parsed.error ?? 'no segments'}`)
    return []
  }
  // A segment can repeat when a ref lists several verse ranges in one chapter.
  return [...new Set(parsed.segments.map((s) => s.chapter))].map((chapter) => ({
    bookNumber: reading.book,
    book: bookName,
    chapter,
    // Flag chapters pulled in only as the tail of a cross-chapter verse span
    // (e.g. `12:1-13:1` drags in chapter 13 for a single verse).
    partial: parsed.segments.some((s) => s.chapter === chapter && s.ranges),
  }))
}

const days = plan.map((entry) => {
  const chapters = []
  const seen = new Set()
  for (const reading of entry.readings) {
    for (const c of planChapters(reading)) {
      const k = chapKey(c.bookNumber, c.chapter)
      if (seen.has(k)) continue
      seen.add(k)
      chapters.push(c)
    }
  }
  const matches = []
  for (const c of chapters) {
    for (const devKey of devByChapter.get(chapKey(c.bookNumber, c.chapter)) ?? []) {
      matches.push({ devKey, chapter: c })
    }
  }
  const matchedChapters = chapters.filter(
    (c) => devByChapter.has(chapKey(c.bookNumber, c.chapter))
  )
  return {
    mmdd: entry.mmdd,
    date: `${entry.mmdd.slice(0, 2)}-${entry.mmdd.slice(2)}`,
    chapters,
    matchedChapters,
    matches,
    candidates: new Set(matches.map((m) => m.devKey)).size,
  }
})

// ---------------------------------------------------------------------------
// refs.csv
// ---------------------------------------------------------------------------

const csvEscape = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = ['key,slot,book,chapter,verse']
for (const r of refRows) {
  csv.push([r.key, r.slot, r.book, r.chapter, r.verse].map(csvEscape).join(','))
}
await writeFile(join(OUT, 'refs.csv'), csv.join('\n') + '\n', 'utf8')

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

const histogram = new Map([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], ['5+', 0]])
for (const d of days) {
  const n = d.matchedChapters.length
  const bucket = n >= 5 ? '5+' : n
  histogram.set(bucket, histogram.get(bucket) + 1)
}

const zeroDays = days.filter((d) => d.matchedChapters.length === 0)
const multiDays = days.filter((d) => d.candidates >= 3)

// How often each chapter is hit across the year: (#days it is read) x (#devotionals on it)
const chapterMatchCounts = new Map()
for (const d of days) {
  for (const m of d.matches) {
    const k = chapKey(m.chapter.bookNumber, m.chapter.chapter)
    if (!chapterMatchCounts.has(k)) {
      chapterMatchCounts.set(k, { ...m.chapter, days: new Set(), devs: new Set() })
    }
    const rec = chapterMatchCounts.get(k)
    rec.days.add(d.mmdd)
    rec.devs.add(m.devKey)
  }
}
const topChapters = [...chapterMatchCounts.values()]
  .sort((a, b) => b.devs.size * b.days.size - a.devs.size * a.days.size
    || b.devs.size - a.devs.size
    || a.bookNumber - b.bookNumber)
  .slice(0, 20)

// Per-book: devotionals keyed there, and how many day-slots they fill.
const byBook = new Map()
for (const r of refRows) {
  if (!byBook.has(r.bookNumber)) {
    byBook.set(r.bookNumber, { book: r.book, bookNumber: r.bookNumber, devs: new Set(), matchSlots: 0 })
  }
  byBook.get(r.bookNumber).devs.add(r.key)
}
for (const d of days) {
  for (const m of d.matches) {
    const rec = byBook.get(m.chapter.bookNumber)
    if (rec) rec.matchSlots += 1
  }
}
const bookRows = [...byBook.values()].sort((a, b) => b.devs.size - a.devs.size || a.bookNumber - b.bookNumber)

// Unused inventory: a devotional whose chapter is never read on any plan day.
const readChapters = new Set()
for (const d of days) for (const c of d.chapters) readChapters.add(chapKey(c.bookNumber, c.chapter))
const unusedDevs = devotionals.filter((dev) =>
  dev.references.length > 0 &&
  refRows.filter((r) => r.key === dev.key).length > 0 &&
  refRows.filter((r) => r.key === dev.key).every((r) => !readChapters.has(chapKey(r.bookNumber, r.chapter)))
)
const feb29 = devotionals.filter((d) => d.month === 2 && d.day === 29)
const neverMatchedDevs = devotionals.filter((dev) => {
  const rows = refRows.filter((r) => r.key === dev.key)
  if (!rows.length) return true
  return !days.some((d) => d.matches.some((m) => m.devKey === dev.key))
})

// Slot skew.
const slotDayMatches = { AM: 0, PM: 0 }
for (const d of days) {
  for (const devKey of new Set(d.matches.map((m) => m.devKey))) {
    slotDayMatches[devKey.endsWith('AM') ? 'AM' : 'PM'] += 1
  }
}
const slotInventory = { AM: 0, PM: 0 }
for (const dev of devotionals) slotInventory[dev.slot] += 1

// Cross-chapter tail chapters (a chapter present for only part of a verse span).
const partialChapters = []
for (const d of days) {
  for (const c of d.chapters) {
    if (c.partial) partialChapters.push(`${d.date}: ${c.book} ${c.chapter}`)
  }
}

// ---------------------------------------------------------------------------
// 10 manual-review samples (deterministic: fixed-seed PRNG, no Math.random)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const flatMatches = []
for (const d of days) {
  for (const m of d.matches) {
    flatMatches.push({ date: d.date, devKey: m.devKey, chapter: m.chapter })
  }
}
const rnd = mulberry32(20260807)
const picked = []
const takenDates = new Set()
while (picked.length < 10 && takenDates.size < flatMatches.length) {
  const cand = flatMatches[Math.floor(rnd() * flatMatches.length)]
  const id = `${cand.date}|${cand.devKey}`
  if (takenDates.has(id)) continue
  takenDates.add(id)
  picked.push(cand)
}

// ---------------------------------------------------------------------------
// coverage-report.md
// ---------------------------------------------------------------------------

const devByKey = new Map(devotionals.map((d) => [d.key, d]))
const L = []
const w = (s = '') => L.push(s)

const totalChapterSlots = days.reduce((a, d) => a + d.chapters.length, 0)
const totalMatchedSlots = days.reduce((a, d) => a + d.matchedChapters.length, 0)

w('# Spurgeon Morning & Evening ↔ M\'Cheyne Coverage Analysis')
w()
w('Generated by `analysis/normalize_refs.mjs` from `analysis/out/devotionals.json`')
w('(produced by `analysis/parse_me.mjs`) and `packages/core/src/bible/mcheyne.plan.json`.')
w('Both sides are parsed with `packages/core/src/songs/verseRef.js`, the repo\'s own')
w('reference parser, so the join shares one book vocabulary with the shipped app.')
w()
w('**The join is chapter-level, not thematic.** A devotional keyed to a single verse')
w('in a chapter counts as a match for that whole chapter. See the manual-review')
w('samples at the end before treating any of these numbers as relevance.')
w()
w('## Headline numbers')
w()
w('| | |')
w('|---|---|')
w(`| Devotionals parsed | ${devotionals.length} |`)
w(`| Scripture references (multi-reference entries counted individually) | ${refRows.length} |`)
w(`| References that failed to parse | ${unparsed.length} |`)
w(`| Distinct chapters carrying ≥1 devotional | ${devByChapter.size} of 1189 (${(devByChapter.size / 1189 * 100).toFixed(1)}%) |`)
w(`| M'Cheyne plan days | ${days.length} |`)
w(`| Chapter-slots across the year (after range expansion) | ${totalChapterSlots} |`)
w(`| Chapter-slots with ≥1 devotional | ${totalMatchedSlots} (${(totalMatchedSlots / totalChapterSlots * 100).toFixed(1)}%) |`)
w(`| Days with ≥1 matched chapter | ${days.length - zeroDays.length} of ${days.length} (${((days.length - zeroDays.length) / days.length * 100).toFixed(1)}%) |`)
w(`| Days with zero matches | ${zeroDays.length} (${(zeroDays.length / days.length * 100).toFixed(1)}%) |`)
w(`| Days needing selection logic (3+ candidate devotionals) | ${multiDays.length} (${(multiDays.length / days.length * 100).toFixed(1)}%) |`)
w()

w('## 1. Histogram — days by number of matched chapters')
w()
w('"Matched chapters" = how many of that day\'s distinct reading chapters have at')
w('least one devotional keyed somewhere inside them.')
w()
w('| Matched chapters | Days | Share |')
w('|---|---|---|')
for (const [bucket, n] of histogram) {
  w(`| ${bucket} | ${n} | ${(n / days.length * 100).toFixed(1)}% |`)
}
w()

w('## 2. Zero-match days')
w()
if (!zeroDays.length) {
  w('**None.** Every day in the plan has at least one reading chapter with a')
  w('devotional keyed to it. A date-keyed fallback would never fire on a')
  w('chapter-matched strategy.')
} else {
  w(`${zeroDays.length} day(s) have no devotional keyed to any of their reading chapters.`)
  w('These are the days a chapter-matched strategy cannot serve at all.')
  w()
  w('| Date | Readings (expanded chapters) |')
  w('|---|---|')
  for (const d of zeroDays) {
    w(`| ${d.date} | ${d.chapters.map((c) => `${c.book} ${c.chapter}`).join(', ')} |`)
  }
}
w()

w('## 3. Top 20 most-matched chapters')
w()
w('Ranked by devotionals-on-the-chapter × days-the-chapter-is-read — i.e. how much')
w('total match volume the chapter generates across the year.')
w()
w('| # | Chapter | Devotionals on it | Days read | Match volume |')
w('|---|---|---|---|---|')
topChapters.forEach((c, i) => {
  w(`| ${i + 1} | ${c.book} ${c.chapter} | ${c.devs.size} | ${c.days.size} | ${c.devs.size * c.days.size} |`)
})
w()

w('## 4. Match distribution by book')
w()
w('`Devotionals` = entries keyed to that book. `Day-slots filled` = how many')
w('(day, devotional) pairings that book produces across the year.')
w()
w('| Book | Devotionals | Share of corpus | Day-slots filled |')
w('|---|---|---|---|')
for (const b of bookRows) {
  w(`| ${b.book} | ${b.devs.size} | ${(b.devs.size / devotionals.length * 100).toFixed(1)}% | ${b.matchSlots} |`)
}
w()
const top10Share = bookRows.slice(0, 10).reduce((a, b) => a + b.devs.size, 0) / devotionals.length
w(`Top 10 books account for **${(top10Share * 100).toFixed(1)}%** of the corpus.`)
w(`Books with no devotional at all: ${66 - bookRows.length === 0 ? 'none — all 66 books are represented' : BOOKS.filter((_, i) => !byBook.has(i + 1)).join(', ')}.`)
w()

w('## 5. Unused inventory')
w()
w(`Devotionals whose chapter never appears in any reading day: **${unusedDevs.length}**.`)
if (!unusedDevs.length) {
  w()
  w('The M\'Cheyne plan reads all 1189 canonical chapters over the year, so every')
  w('parseable devotional is reachable by at least one day.')
}
w()
w(`Devotionals never matched on any day (includes unparseable references): **${neverMatchedDevs.length}**`)
if (neverMatchedDevs.length) {
  w()
  for (const d of neverMatchedDevs) w(`- \`${d.key}\` — ${d.references.join(' / ')}`)
}
w()

w('## 6. Multi-match days — where selection logic would be needed')
w()
w(`${multiDays.length} of ${days.length} days (${(multiDays.length / days.length * 100).toFixed(1)}%) have 3+ candidate devotionals.`)
w()
const candHist = new Map()
for (const d of days) candHist.set(d.candidates, (candHist.get(d.candidates) ?? 0) + 1)
w('| Candidate devotionals | Days |')
w('|---|---|')
for (const [n, c] of [...candHist.entries()].sort((a, b) => a[0] - b[0])) w(`| ${n} | ${c} |`)
w()
const worst = [...days].sort((a, b) => b.candidates - a.candidates).slice(0, 15)
w('Heaviest days:')
w()
w('| Date | Candidates | Readings |')
w('|---|---|---|')
for (const d of worst) {
  w(`| ${d.date} | ${d.candidates} | ${d.chapters.map((c) => `${c.book} ${c.chapter}`).join(', ')} |`)
}
w()

w('## 7. Slot skew')
w()
w('| Slot | Devotionals in corpus | Day-slots filled | Share of matches |')
w('|---|---|---|---|')
const totalSlotMatches = slotDayMatches.AM + slotDayMatches.PM
for (const slot of ['AM', 'PM']) {
  w(`| ${slot} | ${slotInventory[slot]} | ${slotDayMatches[slot]} | ${(slotDayMatches[slot] / totalSlotMatches * 100).toFixed(1)}% |`)
}
w()
const skew = Math.abs(slotDayMatches.AM - slotDayMatches.PM) / totalSlotMatches
w(skew < 0.02
  ? `Effectively no skew (${(skew * 100).toFixed(1)}% apart). Matches land evenly across AM and PM.`
  : `Skew of ${(skew * 100).toFixed(1)}% toward ${slotDayMatches.AM > slotDayMatches.PM ? 'AM' : 'PM'}.`)
w()

w('## 8. Manual-review samples')
w()
w('Ten matches drawn with a fixed-seed PRNG (seed 20260807), so this list is')
w('stable across runs. **A verse-level join is not a thematic join.** These exist')
w('so a human can judge relevance, which no metric above will tell you.')
w()
w('| # | Plan date | Chapter read | Devotional | Its reference | Core text |')
w('|---|---|---|---|---|---|')
picked.forEach((p, i) => {
  const dev = devByKey.get(p.devKey)
  const core = dev.coreText.replace(/\|/g, '\\|').replace(/_/g, '')
  w(`| ${i + 1} | ${p.date} | ${p.chapter.book} ${p.chapter.chapter} | \`${p.devKey}\` | ${dev.references.join(' / ')} | ${core} |`)
})
w()

w('## 9. Caveats and known data issues')
w()
w(`- **Feb 29.** The M&E corpus HAS both slots for Feb 29 (\`02-29-AM\`, \`02-29-PM\`); the M'Cheyne plan does NOT (365 entries, no \`0229\`). Those 2 devotionals are excluded from every day-keyed number above — they cannot be joined. The app's current fallback is \`dayOfYear(date) % 365\` in \`packages/core/src/bible/plan.ts\`. What Feb 29 should show is a product decision, not settled here.`)
w(`  - Feb 29 devotional references, for reference: ${feb29.map((d) => `\`${d.key}\` → ${d.references.join(' / ')}`).join('; ')}`)
w(`- **Multi-reference devotionals.** \`07-12-AM\` carries 3 core text/reference pairs and \`08-30-PM\` carries 2. All references participate in the join; \`coreText\`/\`reference\` hold the first, \`coreTexts\`/\`references\` hold all.`)
w(`- **Reference fixups applied:** ${PERIOD_FIXUPS.length}. ${PERIOD_FIXUPS.length ? PERIOD_FIXUPS.map((f) => `\`${f}\``).join(', ') + ' — one reference uses a period where every other uses a colon; the repo parser rejects it as-is.' : ''}`)
w(`- **Unparsed devotional references:** ${unparsed.length}.`)
if (unparsed.length) for (const u of unparsed) w(`  - \`${u.key}\` — "${u.ref}" (${u.error})`)
w(`- **Unparsed plan readings:** ${planUnparsed.length}.`)
if (planUnparsed.length) for (const u of planUnparsed) w(`  - ${u}`)
w(`- **Cross-chapter tail chapters:** ${partialChapters.length} chapter-slots come from verse-scoped refs (e.g. \`12:1-13:1\` drags in chapter 13 for one verse; \`119:1-24\` covers part of Psalm 119). They are counted as full chapters, matching \`expandReadings()\` in the app. This slightly inflates the denominator.`)
w(`- **Single-chapter books.** In \`Jude 24\`, \`2 John 2\`, \`Philemon 2\`, \`3 John 3\` the number is a verse, not a chapter. The repo parser's \`SINGLE_CHAPTER_BOOKS\` set resolves these to chapter 1 correctly.`)
w(`- **Source transcription defect:** \`04-14-PM\` contains a doubled underscore (\`__well upon divine\`) — the only entry with unbalanced italic markers. Preserved as-is rather than silently "fixed".`)
w(`- **\`--\` is not a reference marker.** 739 lines in the source begin with \`--\` but only 735 are references; 4 are body prose using \`--\` as a leading em-dash. The parser discriminates on right-padding (indent ≥ 20), not on the \`--\` prefix.`)
w()

await writeFile(join(OUT, 'coverage-report.md'), L.join('\n'), 'utf8')

console.log(`Wrote ${join(OUT, 'refs.csv')} (${refRows.length} rows)`)
console.log(`Wrote ${join(OUT, 'coverage-report.md')}`)
console.log()
console.log(`  references parsed:      ${refRows.length}`)
console.log(`  references unparsed:    ${unparsed.length}`)
console.log(`  plan readings unparsed: ${planUnparsed.length}`)
console.log(`  chapters with a devotional: ${devByChapter.size} / 1189`)
console.log(`  zero-match days:        ${zeroDays.length} / ${days.length}`)
console.log(`  3+-candidate days:      ${multiDays.length} / ${days.length}`)
if (unparsed.length) {
  console.log('\n  UNPARSED:')
  for (const u of unparsed) console.log(`    ${u.key}  "${u.ref}"  ${u.error}`)
}
