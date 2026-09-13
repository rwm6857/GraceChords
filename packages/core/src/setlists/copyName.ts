// Naming for a duplicated setlist: "Sunday Morning" → "Sunday Morning (2)".
//
// Pure, so the numbering rule is unit-tested rather than inferred from whatever
// the list happened to contain.

const COPY_SUFFIX_RE = /^(.*?)\s*\((\d+)\)\s*$/

/**
 * The stem a copy number hangs off. Duplicating "Set (2)" yields "Set (3)", not
 * "Set (2) (2)" — otherwise repeatedly duplicating the same row grows a tail of
 * parentheses.
 */
export function copyNameStem(name: string): string {
  const trimmed = (name || '').trim()
  const match = COPY_SUFFIX_RE.exec(trimmed)
  return match ? match[1].trim() : trimmed
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
