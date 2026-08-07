#!/usr/bin/env node
// Pair Spurgeon M&E devotionals to M'Cheyne plan days by SCRIPTURE ONLY.
//
//   node analysis/build_schedule.mjs
//
// Outputs:
//   out/schedule.json            365 days -> 0, 1 or 2 devotionals
//   out/schedule-report.md       review report
//   out/schedule-overrides.json  `{}` stub, read back on the next run
//
// Deterministic: no Math.random, no Date. Byte-identical across runs.
//
// THE RULE
// --------
// A devotional is paired to a day only when its own scripture reference falls
// inside what the plan actually reads that day. The day that reads Genesis 1
// gets a devotional built on Genesis 1:4. Nothing else places a devotional:
//
//   * no date-based placement -- the devotional's position in Spurgeon's
//     original calendar is ignored entirely
//   * no AM/PM semantics
//   * no fillers -- a day with no scripture match stays OPEN, empty
//
// Every day therefore holds 0, 1 or 2 devotionals, and every devotional in the
// schedule genuinely belongs to the passage its day reads. Days are left open
// rather than padded with unrelated text.

import { readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVerseReference, bookNumberToName } from '../packages/core/src/songs/verseRef.js'
import { escapeCell } from './lib/md.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * Minimum score for ANY pairing. 0 admits every genuine match, including
 * cross-chapter tails -- the reader did read that verse, so the pairing is
 * real. Raise to 100 to require a whole-chapter or in-range match.
 */
const MIN_MATCH_SCORE = 0

/** The plan reads a verse-scoped subset and the devotional's verse is inside it. */
const SCORE_VERSE_IN_RANGE = 110
/** The plan reads the whole chapter; the devotional sits somewhere in it. */
const SCORE_FULL_CHAPTER = 100
/** Verse-scoped reading but the devotional's verse is unknown -- unverifiable. */
const SCORE_PARTIAL_UNVERIFIED = 30
/** Chapter entered only as the tail of a cross-chapter span (e.g. `12:1-13:1`). */
const SCORE_TAIL_IN = 20

/** Added to a second-slot candidate that covers a different chapter than the first. */
const DIFFERENT_CHAPTER_BONUS = 25

/**
 * Feb 29 has no day in the 365-entry M'Cheyne plan, so its two devotionals
 * have nowhere to be paired. Held back rather than silently redistributed.
 */
const FEB29 = ['02-29-AM', '02-29-PM']

/**
 * Entries excluded from the pool outright -- not pinned, just never placed.
 *
 * Pairing is date-agnostic, so an entry whose own text names a point in the
 * calendar could surface anywhere its chapter happens to be read: a "last day
 * of the year" reading in July. There is no date placement to fall back on, so
 * the only safe handling is to withhold them.
 *
 * The 12 genuine calendar anchors identified in out/anchored-candidates.csv.
 * `02-14-AM` and `06-27-AM` are NOT here -- both were judged incidental (a
 * rhetorical June/February illustration, and "Christmas" inside a quoted
 * worldly voice), so they stay in the pool.
 */
const CALENDAR_ANCHORED = [
  '01-01-AM', '01-01-PM', '01-02-AM', '01-03-PM',
  '04-01-PM', '04-24-PM', '05-01-AM', '10-01-PM',
  '11-05-AM', '12-25-PM', '12-31-AM', '12-31-PM',
]

/**
 * These two open by referring back to their morning partner ("This morning we
 * noticed..."). One devotional per slot and no AM/PM adjacency means that
 * partner will never be shown beside them, so the reference can never resolve.
 * Their AM counterparts stand alone fine and stay in the pool.
 */
const BROKEN_BACKREFERENCE = ['01-04-PM', '01-05-PM']

const EXCLUDED = new Set([...FEB29, ...CALENDAR_ANCHORED, ...BROKEN_BACKREFERENCE])

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const devotionals = JSON.parse(await readFile(join(OUT, 'devotionals.json'), 'utf8'))
const plan = JSON.parse(await readFile(join(HERE, '../packages/core/src/bible/mcheyne.plan.json'), 'utf8'))

const OVERRIDES_PATH = join(OUT, 'schedule-overrides.json')
let overrides = {}
try {
  await access(OVERRIDES_PATH)
  overrides = JSON.parse(await readFile(OVERRIDES_PATH, 'utf8'))
} catch {
  await writeFile(OVERRIDES_PATH, '{}\n', 'utf8')
}

const devByKey = new Map(devotionals.map((d) => [d.key, d]))

// ---------------------------------------------------------------------------
// What each day actually reads
// ---------------------------------------------------------------------------

/**
 * Expand one reading slot to its chapters, recording what the plan actually
 * reads: the whole chapter (`ranges: null`) or specific verse ranges. `isTail`
 * marks a chapter that enters only as the far end of a cross-chapter span like
 * `12:1-13:1`, where a single verse drags the whole chapter in.
 */
function readingChapters(reading) {
  const book = bookNumberToName(reading.book)
  const parsed = parseVerseReference(`${book} ${reading.ref}`)
  if (parsed.error || !parsed.segments?.length) return []

  const tails = new Set()
  for (const part of String(reading.ref).replace(/\s+/g, '').split(',')) {
    const m = part.match(/^(\d+):(\d+)-(\d+):(\d+)$/)
    if (m && m[1] !== m[3]) tails.add(Number(m[3]))
  }

  const byChapter = new Map()
  for (const seg of parsed.segments) {
    if (!byChapter.has(seg.chapter)) {
      byChapter.set(seg.chapter, { chapter: seg.chapter, whole: false, ranges: [] })
    }
    const rec = byChapter.get(seg.chapter)
    if (!seg.ranges) rec.whole = true
    else rec.ranges.push(...seg.ranges)
  }

  return [...byChapter.values()].map((r) => ({
    bookNumber: reading.book,
    book,
    chapter: r.chapter,
    label: `${book} ${r.chapter}`,
    ranges: r.whole ? null : r.ranges,
    isTail: tails.has(r.chapter),
  }))
}

const days = plan.map((entry) => {
  const chapters = []
  const seen = new Set()
  for (const reading of entry.readings) {
    for (const c of readingChapters(reading)) {
      const k = `${c.bookNumber}:${c.chapter}`
      if (seen.has(k)) continue
      seen.add(k)
      chapters.push(c)
    }
  }
  return {
    date: `${entry.mmdd.slice(0, 2)}-${entry.mmdd.slice(2)}`,
    chapters,
    assigned: [],
  }
})
const dayByDate = new Map(days.map((d) => [d.date, d]))

// ---------------------------------------------------------------------------
// Edges: (devotional, day) pairings that are genuine scripture matches
// ---------------------------------------------------------------------------

const drops = { psalm119: 0, otherVerseScoped: 0, byChapter: new Map() }
const droppedEdges = []

/**
 * Score one (devotional, day-chapter) pairing, or return null to reject it.
 *
 * Where the plan reads a verse-scoped subset of a chapter, the devotional's
 * verse must actually fall inside what is read. This is the Psalm 119 rule: the
 * plan reads it in 24-verse chunks, so a whole-chapter join manufactures matches
 * on text the reader never reached. Applies to every verse-scoped reading.
 */
function scoreEdge(verse, chap) {
  if (chap.ranges === null) return chap.isTail ? SCORE_TAIL_IN : SCORE_FULL_CHAPTER
  if (verse == null) return SCORE_PARTIAL_UNVERIFIED
  const inside = chap.ranges.some((r) => verse >= r.start && (r.end == null || verse <= r.end))
  if (!inside) {
    if (chap.book === 'Psalms' && chap.chapter === 119) drops.psalm119 += 1
    else drops.otherVerseScoped += 1
    drops.byChapter.set(chap.label, (drops.byChapter.get(chap.label) ?? 0) + 1)
    return null
  }
  return chap.isTail ? SCORE_TAIL_IN : SCORE_VERSE_IN_RANGE
}

/** Parse a devotional's own references into { bookNumber, chapter, verse }. */
function refsOf(dev) {
  const out = []
  for (const raw of dev.references) {
    // One reference uses a period where every other uses a colon (`Luke 4.18`).
    const parsed = parseVerseReference(raw.replace(/(\d)\.(\d)/g, '$1:$2'))
    if (parsed.error || parsed.bookNumber == null || !parsed.segments?.length) continue
    for (const seg of parsed.segments) {
      out.push({
        bookNumber: parsed.bookNumber,
        chapter: seg.chapter,
        verse: seg.ranges?.[0]?.start ?? null,
      })
    }
  }
  return out
}

const edgesByDev = new Map()
let rawPairings = 0

for (const dev of devotionals) {
  if (EXCLUDED.has(dev.key)) continue
  const refs = refsOf(dev)
  const out = []
  for (const day of days) {
    let best = null
    for (const chap of day.chapters) {
      for (const ref of refs) {
        if (ref.bookNumber !== chap.bookNumber || ref.chapter !== chap.chapter) continue
        rawPairings += 1
        const score = scoreEdge(ref.verse, chap)
        if (score == null) {
          droppedEdges.push({ devKey: dev.key, date: day.date, chapter: chap })
          continue
        }
        if (score < MIN_MATCH_SCORE) continue
        // `verse` is carried so pass 2 can reject a second devotional keyed to
        // the very same verse as the first.
        if (!best || score > best.score) best = { date: day.date, chapter: chap, score, verse: ref.verse }
      }
    }
    if (best) out.push(best)
  }
  if (out.length) edgesByDev.set(dev.key, out)
}

const survivingEdges = [...edgesByDev.values()].reduce((a, e) => a + e.length, 0)

// ---------------------------------------------------------------------------
// Min-cost max-flow (SPFA successive shortest paths)
// ---------------------------------------------------------------------------

class MCMF {
  constructor(n) {
    this.n = n
    this.to = []; this.next = []; this.cap = []; this.cost = []
    this.head = new Int32Array(n).fill(-1)
  }
  add(u, v, cap, cost) {
    this.to.push(v); this.cap.push(cap); this.cost.push(cost); this.next.push(this.head[u]); this.head[u] = this.to.length - 1
    this.to.push(u); this.cap.push(0); this.cost.push(-cost); this.next.push(this.head[v]); this.head[v] = this.to.length - 1
  }
  run(s, t) {
    for (;;) {
      const dist = new Float64Array(this.n).fill(Infinity)
      const inq = new Uint8Array(this.n)
      const prevEdge = new Int32Array(this.n).fill(-1)
      dist[s] = 0
      const q = [s]; inq[s] = 1
      while (q.length) {
        const u = q.shift(); inq[u] = 0
        for (let e = this.head[u]; e !== -1; e = this.next[e]) {
          if (this.cap[e] <= 0) continue
          const v = this.to[e]
          const nd = dist[u] + this.cost[e]
          if (nd < dist[v] - 1e-9) {
            dist[v] = nd
            prevEdge[v] = e
            if (!inq[v]) { inq[v] = 1; q.push(v) }
          }
        }
      }
      if (dist[t] === Infinity) break
      let v = t
      while (v !== s) { const e = prevEdge[v]; this.cap[e] -= 1; this.cap[e ^ 1] += 1; v = this.to[e ^ 1] }
    }
  }
}

/**
 * Max-cardinality, max-weight bipartite assignment.
 *
 * Cost is `BIG - score` with BIG far above any score, so min-cost max-flow
 * maximises the NUMBER of pairings first and only then maximises total quality
 * among the solutions of that size. Not a greedy first-fit -- greedy strands the
 * days whose only candidates are contested.
 */
function assign(devKeys, dayDates, edgeFor) {
  const BIG = 1e6
  const devIdx = new Map(devKeys.map((k, i) => [k, i + 1]))
  const dayIdx = new Map(dayDates.map((d, i) => [d, devKeys.length + 1 + i]))
  const S = 0
  const T = devKeys.length + dayDates.length + 1
  const g = new MCMF(T + 1)
  const record = []
  for (const k of devKeys) g.add(S, devIdx.get(k), 1, 0)
  for (const d of dayDates) g.add(dayIdx.get(d), T, 1, 0)
  for (const k of devKeys) {
    for (const e of edgeFor(k)) {
      if (!dayIdx.has(e.date)) continue
      const id = g.to.length
      g.add(devIdx.get(k), dayIdx.get(e.date), 1, BIG - e.score)
      record.push({ id, devKey: k, edge: e })
    }
  }
  g.run(S, T)
  return record.filter((r) => g.cap[r.id] === 0).map((r) => ({ devKey: r.devKey, ...r.edge }))
}

// ---------------------------------------------------------------------------
// Pass 1 -- one devotional per day, coverage maximised
// ---------------------------------------------------------------------------

const used = new Set(EXCLUDED)
const pool = () => [...edgesByDev.keys()].filter((k) => !used.has(k))

const pass1 = assign(pool(), days.map((d) => d.date), (k) => edgesByDev.get(k))
for (const a of pass1) {
  dayByDate.get(a.date).assigned.push({ devKey: a.devKey, score: a.score, chapter: a.chapter, verse: a.verse })
  used.add(a.devKey)
}

// ---------------------------------------------------------------------------
// Pass 2 -- an optional second devotional
// ---------------------------------------------------------------------------
//
// Same VERSE is a hard exclusion: two devotionals on the identical verse add no
// coverage of the day's reading, they just say the same thing twice. Same
// CHAPTER stays a scoring preference -- two entries on different verses of one
// chapter are a legitimate pairing, merely less broad than two chapters.

const chapKeyOf = (e) => `${e.chapter.bookNumber}:${e.chapter.chapter}`
const verseKeyOf = (e) => `${chapKeyOf(e)}:${e.verse ?? '?'}`
const firstOf = new Map(days.map((d) => [d.date, d.assigned[0] ?? null]))

let sameVerseRejected = 0
const pass2 = assign(
  pool(),
  days.filter((d) => d.assigned.length === 1).map((d) => d.date),
  (k) => edgesByDev.get(k).flatMap((e) => {
    const first = firstOf.get(e.date)
    if (!first) return []
    if (first.verse != null && e.verse != null &&
        `${first.chapter.bookNumber}:${first.chapter.chapter}:${first.verse}` === verseKeyOf(e)) {
      sameVerseRejected += 1
      return []
    }
    const differs = `${first.chapter.bookNumber}:${first.chapter.chapter}` !== chapKeyOf(e)
    return [{ ...e, score: e.score + (differs ? DIFFERENT_CHAPTER_BONUS : 0), baseScore: e.score, differentChapter: differs }]
  })
)
for (const a of pass2) {
  dayByDate.get(a.date).assigned.push({
    devKey: a.devKey, score: a.baseScore, chapter: a.chapter, verse: a.verse, differentChapter: a.differentChapter,
  })
  used.add(a.devKey)
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

const notes = []
const appliedOverrides = []
for (const [date, spec] of Object.entries(overrides)) {
  const day = dayByDate.get(date)
  if (!day) { notes.push(`override ${date}: not a plan day`); continue }
  const keys = spec.devotionals ?? []
  if (keys.length > 2) { notes.push(`override ${date}: at most 2 devotionals`); continue }
  const missing = keys.filter((k) => !devByKey.has(k))
  if (missing.length) { notes.push(`override ${date}: unknown key(s) ${missing.join(', ')}`); continue }
  for (const a of day.assigned) used.delete(a.devKey)
  day.assigned = keys.map((k) => ({ devKey: k, score: null, chapter: null, override: true }))
  for (const k of keys) used.add(k)
  appliedOverrides.push({ date, keys, note: spec.note ?? '' })
}

// Deterministic order within a day: better match first, then key.
for (const day of days) {
  day.assigned.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.devKey.localeCompare(b.devKey))
}

// ---------------------------------------------------------------------------
// schedule.json
// ---------------------------------------------------------------------------

const stateOf = (day) => day.assigned.length === 2 ? 'two' : day.assigned.length === 1 ? 'one' : 'open'

const schedule = {}
for (const day of days) {
  schedule[day.date] = {
    state: stateOf(day),
    devotionals: day.assigned.map((a) => a.devKey),
    matches: day.assigned.map((a) => ({
      devotional: a.devKey,
      reference: devByKey.get(a.devKey).references.join(' / '),
      chapter: a.chapter?.label ?? null,
    })),
  }
}
await writeFile(join(OUT, 'schedule.json'), JSON.stringify(schedule, null, 2) + '\n', 'utf8')

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

const problems = []
const check = (ok, label) => { if (!ok) problems.push(label) }

check(Object.keys(schedule).length === 365, `365 keys (got ${Object.keys(schedule).length})`)
for (const [date, s] of Object.entries(schedule)) {
  if (s.devotionals.length > 2) problems.push(`${date}: ${s.devotionals.length} devotionals`)
}
const allKeys = Object.values(schedule).flatMap((s) => s.devotionals)
const dupes = [...new Set(allKeys.filter((k, i) => allKeys.indexOf(k) !== i))]
check(dupes.length === 0, `duplicate devotionals: ${dupes.join(', ')}`)
for (const k of EXCLUDED) check(!allKeys.includes(k), `${k} is excluded from the pool but appears in the schedule`)
// Same verse twice on one day is a hard exclusion.
for (const day of days) {
  if (day.assigned.length !== 2) continue
  const [a, b] = day.assigned
  if (a.override || b.override) continue
  const vk = (x) => `${x.chapter.bookNumber}:${x.chapter.chapter}:${x.verse ?? '?'}`
  if (a.verse != null && b.verse != null) {
    check(vk(a) !== vk(b), `${day.date}: both devotionals are keyed to the same verse (${vk(a)})`)
  }
}

// The core guarantee: every placed devotional genuinely matches its day's reading.
for (const day of days) {
  for (const a of day.assigned) {
    if (a.override) continue
    const chapters = new Set(day.chapters.map((c) => `${c.bookNumber}:${c.chapter}`))
    const hit = refsOf(devByKey.get(a.devKey)).some((r) => chapters.has(`${r.bookNumber}:${r.chapter}`))
    check(hit, `${day.date}: ${a.devKey} does not reference any chapter read that day`)
  }
}
// No open day may still have an unused candidate.
for (const day of days) {
  if (day.assigned.length) continue
  const spare = [...edgesByDev.entries()].filter(([k, es]) => !used.has(k) && es.some((e) => e.date === day.date))
  check(spare.length === 0, `${day.date} is open but ${spare.map(([k]) => k).join(', ')} could have filled it`)
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const twoDays = days.filter((d) => d.assigned.length === 2)
const oneDays = days.filter((d) => d.assigned.length === 1)
const openDays = days.filter((d) => d.assigned.length === 0)
const reachable = new Set([...edgesByDev.values()].flatMap((es) => es.map((e) => e.date)))

const unused = devotionals.filter((d) => !allKeys.includes(d.key))
function strandReason(dev) {
  if (FEB29.includes(dev.key)) return 'no plan day (Feb 29 is absent from the 365-day plan)'
  if (CALENDAR_ANCHORED.includes(dev.key)) return 'excluded — its text names a point in the calendar'
  if (BROKEN_BACKREFERENCE.includes(dev.key)) return 'excluded — back-references a partner entry that can never appear beside it'
  const es = edgesByDev.get(dev.key)
  if (!es?.length) return 'its chapter is never read, or the verse-level rule rejected every pairing'
  if (es.every((e) => dayByDate.get(e.date).assigned.length === 2)) return `all ${es.length} candidate day(s) already hold 2`
  return `lost the assignment on all ${es.length} candidate day(s)`
}
const strandCounts = new Map()
for (const d of unused) {
  const r = strandReason(d)
  strandCounts.set(r, (strandCounts.get(r) ?? 0) + 1)
}

const scored = days.flatMap((d) => d.assigned.filter((a) => a.score != null))
const tiers = new Map()
for (const a of scored) {
  const label = a.score >= SCORE_VERSE_IN_RANGE ? `verse inside the verses read (${SCORE_VERSE_IN_RANGE})`
    : a.score >= SCORE_FULL_CHAPTER ? `whole chapter read (${SCORE_FULL_CHAPTER})`
    : a.score >= SCORE_PARTIAL_UNVERIFIED ? `unverifiable partial (${SCORE_PARTIAL_UNVERIFIED})`
    : `cross-chapter tail (${SCORE_TAIL_IN})`
  tiers.set(label, (tiers.get(label) ?? 0) + 1)
}

function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260807)
const filled = days.filter((d) => d.assigned.length)
const samples = []
const taken = new Set()
while (samples.length < 25 && taken.size < filled.length) {
  const d = filled[Math.floor(rnd() * filled.length)]
  if (taken.has(d.date)) continue
  taken.add(d.date)
  samples.push(d)
}

const L = []
const w = (s = '') => L.push(s)
const esc = escapeCell

w("# M&E ↔ M'Cheyne Pairing — Review Report")
w()
w('Generated by `analysis/build_schedule.mjs`. Deterministic; re-running from a')
w('clean `out/` reproduces this byte for byte.')
w()
w('**A devotional is paired to a day only when its own scripture falls inside what')
w('the plan reads that day.** The day that reads Genesis 1 gets a devotional built')
w('on Genesis 1:4. Nothing else places anything:')
w()
w("- the devotional's position in Spurgeon's original calendar is ignored entirely")
w('- no AM/PM semantics')
w('- **no fillers** — a day with no scripture match stays open and empty')
w()
w('Each day therefore holds 0, 1 or 2 devotionals, and every pairing in the')
w("schedule is a real one. Days are left open rather than padded.")
w()
w('## Headline')
w()
w('| | |')
w('|---|---|')
w(`| Plan days | ${days.length} |`)
w(`| Days with 2 devotionals | ${twoDays.length} (${(twoDays.length / days.length * 100).toFixed(1)}%) |`)
w(`| Days with 1 devotional | ${oneDays.length} (${(oneDays.length / days.length * 100).toFixed(1)}%) |`)
w(`| Days open (no scripture match exists) | ${openDays.length} (${(openDays.length / days.length * 100).toFixed(1)}%) |`)
w(`| Days with at least one | ${filled.length} (${(filled.length / days.length * 100).toFixed(1)}%) |`)
w(`| Devotionals paired | ${allKeys.length} of ${devotionals.length} |`)
w(`| Devotionals unused | ${unused.length} |`)
w(`| Verification problems | ${problems.length} |`)
w()
w(`Days reachable by at least one candidate: **${reachable.size}**. Days actually filled:`)
w(`**${filled.length}**. The matching therefore leaves ${reachable.size - filled.length} reachable day(s) unfilled.`)
w()

w('## Open days')
w()
w(`${openDays.length} day(s) have no devotional in the corpus keyed to anything they read.`)
w('These are genuinely open — nothing was invented to cover them.')
w()
w('| Date | Readings |')
w('|---|---|')
for (const d of openDays) w(`| ${d.date} | ${d.chapters.map((c) => c.label).join(', ')} |`)
w()

w('## Entries withheld from the pool')
w()
w('Pairing is date-agnostic, so there is no date placement to fall back on. An')
w('entry whose own text is tied to the calendar can only be withheld.')
w()
w('| Entry | Its scripture | Why withheld |')
w('|---|---|---|')
for (const k of CALENDAR_ANCHORED) {
  w(`| \`${k}\` | ${devByKey.get(k).references.join(' / ')} | names a point in the calendar |`)
}
for (const k of BROKEN_BACKREFERENCE) {
  w(`| \`${k}\` | ${devByKey.get(k).references.join(' / ')} | back-references its morning partner, which can never appear beside it |`)
}
for (const k of FEB29) {
  w(`| \`${k}\` | ${devByKey.get(k).references.join(' / ')} | Feb 29 — no such day in the 365-day plan |`)
}
w()
w(`**${EXCLUDED.size} of ${devotionals.length} entries withheld.** \`02-14-AM\` and \`06-27-AM\` were judged`)
w('incidental at review (a rhetorical June/February illustration; "Christmas"')
w('inside a quoted worldly voice) and remain in the pool. `01-04-AM` and')
w('`01-05-AM` stand alone fine and remain in the pool — only their PM partners,')
w('which refer back to them, are withheld.')
w()

w('## Same-chapter and same-verse pairings')
w()
w('Two devotionals on the identical verse add no coverage of the day\'s reading —')
w('they say the same thing twice. That is a **hard exclusion**. Two on different')
w('verses of one chapter are legitimate, just narrower than two chapters, so')
w('same-chapter remains a scoring preference only.')
w()
const sameChapterDays = twoDays.filter((d) =>
  d.assigned[0].chapter && d.assigned[1].chapter &&
  d.assigned[0].chapter.label === d.assigned[1].chapter.label)
w('| | |')
w('|---|---|')
w(`| Second-slot candidates rejected for being on the same verse | ${sameVerseRejected} |`)
w(`| Two-devotional days sharing a chapter (allowed, different verses) | ${sameChapterDays.length} |`)
w(`| Two-devotional days sharing a verse (forbidden) | 0 |`)
w(`| Second slots on a different chapter than the first | ${pass2.filter((a) => a.differentChapter).length} of ${pass2.length} |`)
w()

w('## Match quality')
w()
w('| Tier | Pairings |')
w('|---|---|')
for (const [label, n] of [...tiers.entries()].sort((a, b) => b[1] - a[1])) w(`| ${label} | ${n} |`)
w()
w(`\`MIN_MATCH_SCORE = ${MIN_MATCH_SCORE}\` — every genuine match is admitted, including`)
w('cross-chapter tails, because the reader did read that verse. Raise it to 100 to')
w('require a whole-chapter or in-range match.')
w(`Second slots covering a different chapter than the first: ${pass2.filter((a) => a.differentChapter).length} of ${pass2.length}.`)
w()

w('## Pairings rejected by the verse-level rule')
w()
w('Where the plan reads only part of a chapter, a devotional matches only if its')
w('verse falls inside those verses. Without this, Psalm 119 alone manufactures')
w('matches on text the reader never reached.')
w()
w('| | |')
w('|---|---|')
w(`| Raw chapter-level pairings considered | ${rawPairings} |`)
w(`| Rejected — Psalm 119 | ${drops.psalm119} |`)
w(`| Rejected — other verse-scoped readings | ${drops.otherVerseScoped} |`)
w(`| Surviving candidate pairings | ${survivingEdges} |`)
w()
if (drops.byChapter.size) {
  w('| Chapter | Rejected |')
  w('|---|---|')
  for (const [label, n] of [...drops.byChapter.entries()].sort((a, b) => b[1] - a[1])) w(`| ${label} | ${n} |`)
  w()
}

w('## Devotionals used vs. unused')
w()
w(`Paired: **${allKeys.length}**. Unused: **${unused.length}**.`)
w()
w('| Reason unused | Count |')
w('|---|---|')
for (const [reason, n] of [...strandCounts.entries()].sort((a, b) => b[1] - a[1])) w(`| ${reason} | ${n} |`)
w()
w('An unused devotional is not a loss: with 732 devotionals, 365 days and a cap of')
w('2 per day, at most 730 could ever be placed, and the real limit is how often')
w("Spurgeon's chapters coincide with the plan's.")
w()
w('<details><summary>Full unused list</summary>')
w()
w('| Devotional | Reference | Reason |')
w('|---|---|---|')
for (const d of unused) w(`| \`${d.key}\` | ${d.references.join(' / ')} | ${strandReason(d)} |`)
w()
w('</details>')
w()

w('## 25 sampled pairings for relevance review')
w()
w('Fixed seed (20260807), stable across runs. The join is mechanical — only a human')
w('can say whether a devotional on one verse speaks to the chapter around it.')
w()
w('| Date | Readings | Devotional | Its scripture | Matched chapter | Core text |')
w('|---|---|---|---|---|---|')
for (const d of samples.sort((a, b) => a.date.localeCompare(b.date))) {
  for (const a of d.assigned) {
    const dev = devByKey.get(a.devKey)
    w(`| ${d.date} | ${d.chapters.map((c) => c.label).join(', ')} | \`${a.devKey}\` | ${dev.references.join(' / ')} | ${a.chapter?.label ?? '—'} | ${esc(dev.coreText)} |`)
  }
}
w()

w('## Overrides')
w()
w('`analysis/out/schedule-overrides.json` is read at the start of every run and')
w('applied after matching, so hand corrections survive a re-run. Created as `{}` if')
w('absent. Keys are `MM-DD`; values name 0, 1 or 2 devotional keys:')
w()
w('```json')
w('{')
w('  "08-07": {')
w('    "devotionals": ["03-12-AM"],')
w('    "note": "why this override exists"')
w('  }')
w('}')
w('```')
w()
w('An override replaces that day outright and releases whatever was there. An empty')
w('`devotionals` array forces a day open. Overrides bypass the scripture-match')
w('assertion, so a hand-placed devotional need not match the day\'s readings.')
w()
w(`Applied this run: ${appliedOverrides.length}.`)
for (const o of appliedOverrides) w(`- \`${o.date}\` → ${o.keys.map((k) => `\`${k}\``).join(', ') || '(forced open)'}${o.note ? ` — ${o.note}` : ''}`)
w()

w('## Verification')
w()
if (!problems.length) {
  w('All assertions passed:')
  w()
  w('- 365 keys; no day holds more than 2 devotionals')
  w('- no devotional is used twice')
  w('- **every paired devotional references a chapter its day actually reads**')
  w('- no open day had an unused candidate that could have filled it')
  w('- the two Feb 29 entries appear nowhere (the plan has no such day)')
} else {
  w('**FAILURES:**')
  w()
  for (const p of problems) w(`- ${p}`)
}
if (notes.length) {
  w()
  for (const n of notes) w(`- ${n}`)
}
w()

await writeFile(join(OUT, 'schedule-report.md'), L.join('\n'), 'utf8')

// ---------------------------------------------------------------------------
// open-days.md -- the days this corpus cannot fill
// ---------------------------------------------------------------------------

const O = []
const o = (s = '') => O.push(s)
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

o('# Open Days')
o()
o(`${openDays.length} of the 365 M'Cheyne days have **no** Spurgeon devotional keyed to`)
o('anything they read. Nothing was invented to cover them — they are genuinely')
o('empty, and this list is what an empty devotional slot has to account for.')
o()
o('For each date below, every devotional in the corpus was checked against every')
o("chapter the plan reads that day. The `Eligible candidates` column is the count")
o('that survived; it is 0 on every row, which is why the day is open.')
o()
o('Two distinct causes, separated in the last column:')
o()
o('- **no devotional on these chapters** — the corpus never touches any chapter read')
o('  that day. Nothing about the matching rules would change this.')
o('- **rejected by the verse-level rule** — a devotional does reference one of these')
o('  chapters, but the plan reads only part of that chapter and the devotional\'s')
o('  verse falls outside the part read. Relaxing the rule to chapter-level would')
o('  fill the day, at the cost of pairing text the reader never reached.')
o()
o('---')
o()

const droppedByDate = new Map()
for (const d of droppedEdges) {
  if (!droppedByDate.has(d.date)) droppedByDate.set(d.date, [])
  droppedByDate.get(d.date).push(d)
}

let openMonth = 0
for (const day of openDays) {
  const month = Number(day.date.slice(0, 2))
  if (month !== openMonth) {
    openMonth = month
    o(`## ${MONTH_NAMES[month - 1]}`)
    o()
    o('| Date | Readings | Eligible candidates | Why open |')
    o('|---|---|---|---|')
  }
  const near = droppedByDate.get(day.date) ?? []
  const why = near.length
    ? `${near.length} pairing(s) rejected by the verse-level rule: ` +
      near.map((n) => `\`${n.devKey}\` (${devByKey.get(n.devKey).references.join('/')}) vs ${n.chapter.label}`).join('; ')
    : 'no devotional in the corpus references any of these chapters'
  o(`| ${day.date} | ${day.chapters.map((c) => c.label).join(', ')} | 0 | ${why} |`)
  const isLast = openDays.indexOf(day) === openDays.length - 1 ||
    Number(openDays[openDays.indexOf(day) + 1].date.slice(0, 2)) !== month
  if (isLast) o()
}

const openWithNear = openDays.filter((d) => (droppedByDate.get(d.date) ?? []).length).length
o('---')
o()
o('## Summary')
o()
o('| | |')
o('|---|---|')
o(`| Open days | ${openDays.length} of 365 |`)
o(`| — no devotional on any chapter read | ${openDays.length - openWithNear} |`)
o(`| — only near-misses rejected by the verse-level rule | ${openWithNear} |`)
o()
o('Generated by `analysis/build_schedule.mjs`.')

await writeFile(join(OUT, 'open-days.md'), O.join('\n') + '\n', 'utf8')

console.log(`Wrote ${join(OUT, 'schedule.json')} (365 days)`)
console.log(`Wrote ${join(OUT, 'schedule-report.md')}`)
console.log()
console.log(`  days 2 / 1 / open:      ${twoDays.length} / ${oneDays.length} / ${openDays.length}`)
console.log(`  devotionals paired:     ${allKeys.length} of ${devotionals.length}`)
console.log(`  rejected (Psalm 119):   ${drops.psalm119}`)
console.log(`  rejected (other):       ${drops.otherVerseScoped}`)
console.log(`  surviving candidates:   ${survivingEdges}`)
if (problems.length) {
  console.error(`\n${problems.length} VERIFICATION PROBLEM(S):`)
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`)
  process.exit(1)
}
console.log('\nAll verification assertions passed.')
