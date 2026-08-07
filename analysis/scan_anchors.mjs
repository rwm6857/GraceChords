#!/usr/bin/env node
// Phase A: find devotionals whose own text anchors them to a time of day or a
// calendar position, so they cannot float to an arbitrary date.
//
//   node analysis/scan_anchors.mjs   -> analysis/out/anchored-candidates.csv
//
// Read-only over analysis/out/devotionals.json. Deterministic.
//
// Two categories, and they are NOT the same problem:
//
//   CALENDAR  - the text names a date, month, season, or point in the year.
//               Showing "the last day of the year" in March is a contradiction.
//               These are true date anchors and must be pinned.
//
//   TIME-OF-DAY - the text says "this morning" / "to-night". These constrain
//               the HOUR, not the DATE. Pinning them to their native date does
//               nothing about it: the reader still opens the app whenever they
//               open it. Reported separately so the two are not conflated.
//
// Matching is case-insensitive and word-boundary anchored, over `bodyPlain`
// (italic underscores already stripped) plus the core text.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'

// `source: 'brief'` = supplied in the task brief. `source: 'found'` = surfaced
// by a discovery sweep over temporal vocabulary in the corpus.
const PATTERNS = [
  // ---- time-of-day (from the brief) ----
  ['time', "this morning", /\bthis morning\b/i, 'brief'],
  ['time', "this evening", /\bthis evening\b/i, 'brief'],
  ['time', "to-night", /\bto-night\b/i, 'brief'],
  ['time', "tonight", /\btonight\b/i, 'brief'],
  ['time', "morning's text", /\bmorning's text\b/i, 'brief'],
  ['time', "evening's text", /\bevening's text\b/i, 'brief'],
  ['time', "this day", /\bthis day\b/i, 'brief'],
  ['time', "ere the sun", /\bere the sun\b/i, 'brief'],
  ['time', "at eventide", /\bat eventide\b/i, 'brief'],
  ['time', "this night", /\bthis night\b/i, 'brief'],
  // ---- time-of-day (found) ----
  ['time', "to-day", /\bto-day\b/i, 'found'],
  ['time', "to-morrow", /\bto-morrow\b/i, 'found'],
  ['time', "this hour", /\bthis hour\b/i, 'found'],
  ['time', "this afternoon", /\bthis afternoon\b/i, 'found'],

  // ---- calendar (from the brief) ----
  ['calendar', "New Year", /\bnew year\b/i, 'brief'],
  ['calendar', "the year now closing", /\bthe year now closing\b/i, 'brief'],
  ['calendar', "this year", /\bthis year\b/i, 'brief'],
  ['calendar', "the past year", /\bthe past year\b/i, 'brief'],
  ['calendar', "the closing year", /\bthe closing year\b/i, 'brief'],
  ['calendar', "last day of the year", /\blast day of the year\b/i, 'brief'],
  // ---- calendar (found) ----
  ['calendar', "another year", /\banother year\b/i, 'found'],
  ['calendar', "opening/dying/departing/coming year", /\b(opening|dying|departing|coming) year\b/i, 'found'],
  ['calendar', "beginning of this year", /\bbeginning of this year\b/i, 'found'],
  // A bare case-insensitive month name is useless here: "May" the modal verb
  // alone produces 358 false hits, "March" the verb 11, "august" the adjective
  // 2. So the unambiguous months match case-sensitively as bare words, and the
  // three ambiguous ones only inside an explicit month context.
  ['calendar', "named month", /\b(January|February|April|June|July|September|October|November|December)\b/, 'found'],
  ['calendar', "named month (ambiguous)", /\b(month of (May|March|August)|this (May|March|August))\b/, 'found'],
  ['calendar', "this month", /\bthis month\b/i, 'found'],
  ['calendar', "Christmas", /\bChristmas\b/i, 'found'],
  ['calendar', "anniversary", /\banniversary\b/i, 'found'],
  ['calendar', "named season", /\bseason of (spring|summer|autumn|winter)\b/i, 'found'],
]

const devotionals = JSON.parse(await readFile(join(OUT, 'devotionals.json'), 'utf8'))

const rows = []
const byTrigger = new Map()
const byKey = new Map()

for (const dev of devotionals) {
  const haystack = `${dev.coreText}\n${dev.bodyPlain}`
  for (const [category, trigger, re, source] of PATTERNS) {
    // Preserve each pattern's own flags -- the month patterns are deliberately
    // case-SENSITIVE and must not be forced to 'i' here.
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    const hits = [...haystack.matchAll(global)]
    if (!hits.length) continue
    const i = hits[0].index
    const excerpt = haystack
      .slice(Math.max(0, i - 60), i + 90)
      .replace(/\s+/g, ' ')
      .trim()
    rows.push({ key: dev.key, slot: dev.slot, trigger, excerpt, category, source, count: hits.length })
    if (!byTrigger.has(trigger)) byTrigger.set(trigger, { category, source, keys: new Set(), hits: 0 })
    const t = byTrigger.get(trigger)
    t.keys.add(dev.key)
    t.hits += hits.length
    if (!byKey.has(dev.key)) byKey.set(dev.key, new Set())
    byKey.get(dev.key).add(category)
  }
}

rows.sort((a, b) => a.key.localeCompare(b.key) || a.trigger.localeCompare(b.trigger))

const csvEscape = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = ['key,slot,trigger,excerpt']
for (const r of rows) csv.push([r.key, r.slot, r.trigger, r.excerpt].map(csvEscape).join(','))
await writeFile(join(OUT, 'anchored-candidates.csv'), csv.join('\n') + '\n', 'utf8')

// ---------------------------------------------------------------------------

const calendarKeys = [...byKey.entries()].filter(([, c]) => c.has('calendar')).map(([k]) => k)
const timeKeys = [...byKey.entries()].filter(([, c]) => c.has('time')).map(([k]) => k)

console.log(`Rows written: ${rows.length}  (${join(OUT, 'anchored-candidates.csv')})`)
console.log(`Distinct devotionals hit: ${byKey.size} of ${devotionals.length}`)
console.log(`  calendar-triggered:    ${calendarKeys.length}`)
console.log(`  time-of-day-triggered: ${timeKeys.length}`)
console.log()
console.log('By trigger (devotionals / total occurrences):')
const ordered = [...byTrigger.entries()].sort((a, b) => b[1].keys.size - a[1].keys.size)
for (const [trigger, t] of ordered) {
  console.log(
    `  ${String(t.keys.size).padStart(4)} / ${String(t.hits).padStart(4)}  [${t.category}/${t.source}]  ${trigger}`
  )
}
console.log()
console.log('Calendar-triggered devotionals (the ones that matter for date anchoring):')
for (const k of calendarKeys.sort()) {
  const trigs = rows.filter((r) => r.key === k && r.category === 'calendar').map((r) => r.trigger)
  console.log(`  ${k}  ${trigs.join(', ')}`)
}
console.log()
console.log(`Float-pool supply check:`)
console.log(`  total devotionals                 ${devotionals.length}`)
console.log(`  minus calendar-anchored           ${devotionals.length - calendarKeys.length}`)
console.log(`  minus calendar + time anchored    ${devotionals.length - byKey.size}`)
