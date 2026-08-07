// Load hand-authored devotionals from content/devotionals/ and merge them into
// the schedule.
//
// Generated JSON is never hand-edited: it gets rewritten on every run, so an
// edit there would be silently wiped and would break determinism. Authored
// content lives in its own durable, human-editable directory and is merged at
// build time.
//
// Authored files use the SAME body conventions as the CCEL corpus (`_italics_`,
// indented verse stanzas) and go through the SAME block parser, so the two
// sources render identically by construction rather than by agreement.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAuthoredBody, parseFrontmatter, toBodyBlocks } from './blocks.mjs'

const REQUIRED = ['reference', 'coreText', 'author', 'sourceWork']
const NAME_RE = /^(\d{2})-(\d{2})\.md$/

/**
 * Read every authored entry. Returns `{ entries, errors }` — an absent or empty
 * directory is not an error, it just yields nothing so the build succeeds
 * unchanged.
 */
export async function loadAuthored(dir) {
  let names
  try {
    names = (await readdir(dir)).filter((n) => NAME_RE.test(n)).sort()
  } catch {
    return { entries: [], errors: [], present: false }
  }

  const entries = []
  const errors = []
  for (const name of names) {
    const [, mm, dd] = name.match(NAME_RE)
    const dayKey = `${mm}-${dd}`
    if (mm === '02' && dd === '29') {
      errors.push(`${name}: 02-29 has no day key — the leap day clamps to 02-28`)
      continue
    }
    const raw = await readFile(join(dir, name), 'utf8')
    const { data, body, hadFrontmatter } = parseFrontmatter(raw)
    if (!hadFrontmatter) {
      errors.push(`${name}: missing --- frontmatter block`)
      continue
    }
    const missing = REQUIRED.filter((k) => !data[k])
    if (missing.length) {
      errors.push(`${name}: frontmatter missing ${missing.join(', ')}`)
      continue
    }
    const blocks = parseAuthoredBody(body.trim())
    if (!blocks.length) {
      errors.push(`${name}: empty body`)
      continue
    }
    entries.push({
      dayKey,
      file: name,
      id: data.id || `authored-${dayKey}`,
      reference: data.reference,
      coreText: data.coreText,
      author: data.author,
      sourceWork: data.sourceWork,
      matchedChapter: data.matchedChapter || null,
      /** Explicit opt-in to displace a Spurgeon entry on a full day. */
      replaces: data.replaces || null,
      bodyBlocks: toBodyBlocks(blocks),
    })
  }
  return { entries, errors, present: true }
}

/**
 * Merge authored entries into the schedule's day map.
 *
 * Collision rule: an authored entry fills an open slot by default. If the day
 * already holds two devotionals, the build FAILS unless the frontmatter carries
 * an explicit `replaces: <id>` naming the entry to displace. Explicit and
 * auditable — never a silent override.
 *
 * `dayDevotionals` maps dayKey -> array of records; mutated in place. Returns a
 * report of what happened.
 */
export function mergeAuthored(dayDevotionals, entries, maxPerDay = 2) {
  const merged = []
  const collisions = []
  const replaced = []

  for (const entry of entries) {
    const list = dayDevotionals.get(entry.dayKey)
    if (!list) {
      collisions.push(`${entry.file}: ${entry.dayKey} is not a day in the plan`)
      continue
    }
    if (entry.replaces) {
      const idx = list.findIndex((d) => d.id === entry.replaces)
      if (idx === -1) {
        collisions.push(
          `${entry.file}: replaces "${entry.replaces}" but ${entry.dayKey} holds ` +
          `[${list.map((d) => d.id).join(', ') || 'nothing'}]`
        )
        continue
      }
      replaced.push(`${entry.file}: displaced ${list[idx].id} on ${entry.dayKey}`)
      list[idx] = entry
      merged.push(entry)
      continue
    }
    if (list.length >= maxPerDay) {
      collisions.push(
        `${entry.file}: ${entry.dayKey} already holds ${list.length} devotionals ` +
        `[${list.map((d) => d.id).join(', ')}] — add "replaces: <id>" to displace one`
      )
      continue
    }
    list.push(entry)
    merged.push(entry)
  }

  return { merged, collisions, replaced }
}
