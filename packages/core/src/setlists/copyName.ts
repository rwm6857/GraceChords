// Naming for a duplicated setlist: "Sunday Morning" → "Sunday Morning (2)".
//
// Pure, so the numbering rule is unit-tested rather than inferred from whatever
// the list happened to contain.

// Anchored at both ends with no repetition before it, so this cannot backtrack.
const DIGITS_ONLY_RE = /^\d+$/

/**
 * The stem a copy number hangs off. Duplicating "Set (2)" yields "Set (3)", not
 * "Set (2) (2)" — otherwise repeatedly duplicating the same row grows a tail of
 * parentheses.
 *
 * Scanned rather than matched with a regex. The obvious pattern for this is
 * /^(.*?)\s*\((\d+)\)\s*$/, but its lazy `.*?` and the `\s*` after it can both
 * match the same whitespace, so a name that is a long run of tabs makes the
 * engine try every split before failing — quadratic in the length of the name
 * (flagged by CodeQL as a polynomial regular expression). Setlist names are
 * user-typed and uncapped, and nextCopyName runs this over every name in the
 * list, so the scan below is used instead: one pass, no backtracking, same
 * result.
 */
export function copyNameStem(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed.endsWith(')')) return trimmed
  const open = trimmed.lastIndexOf('(')
  if (open < 0) return trimmed
  const inner = trimmed.slice(open + 1, -1)
  if (!DIGITS_ONLY_RE.test(inner)) return trimmed
  return trimmed.slice(0, open).trim()
}

/**
 * The next free "<stem> (n)" for `name`, given the names already in use.
 *
 * Numbering starts at 2 (the original is understood as 1) and takes the lowest
 * free number rather than max+1, so deleting a copy frees its slot instead of
 * leaving the sequence to climb forever.
 *
 * Comparison is case- and whitespace-insensitive because the names are
 * hand-typed, and "sunday (2)" sitting beside "Sunday (2)" is a bug report.
 */
export function nextCopyName(name: string, existingNames: readonly string[]): string {
  const stem = copyNameStem(name) || 'New Setlist'
  const key = (value: string) => value.trim().toLowerCase()
  const taken = new Set(existingNames.map(key))

  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem} (${n})`
    if (!taken.has(key(candidate))) return candidate
  }
  // Unreachable for any real list; a unique-enough fallback beats looping.
  return `${stem} (${Date.now()})`
}

/**
 * `base` if it is free, otherwise the next numbered variant.
 *
 * Used when a generated name (e.g. the date-based default) may already be in
 * use: the first set of the day keeps the clean "9/12 Worship", and only a
 * second one that day becomes "9/12 Worship (2)".
 */
export function uniqueName(base: string, existingNames: readonly string[]): string {
  const key = (value: string) => value.trim().toLowerCase()
  const taken = new Set(existingNames.map(key))
  return taken.has(key(base)) ? nextCopyName(base, existingNames) : base.trim()
}
