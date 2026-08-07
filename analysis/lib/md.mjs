// Markdown escaping for the generated reports.
//
// Lives in one place because it was duplicated across build_schedule.mjs and
// normalize_refs.mjs, and both copies had the same defect: they escaped `|`
// without escaping backslashes first, so a backslash in the input would have
// produced `\\|` — an escaped backslash followed by a BARE pipe, breaking the
// table row it was meant to protect. CodeQL flagged both copies.
//
// The CCEL corpus happens to contain neither backslashes nor pipes, so nothing
// was actually broken. But `content/devotionals/` takes hand-authored text, and
// an escaping helper that is only correct for the data it happens to see today
// is a trap for whoever writes the first devotional containing a pipe.

/**
 * Escape a value for use inside a markdown TABLE CELL.
 *
 * Order matters: backslashes must be escaped before anything that introduces
 * backslashes, or the escapes escape each other.
 *
 * Newlines are collapsed rather than escaped — a cell cannot contain one, and a
 * hymn stanza or multi-line core text would otherwise split the row.
 *
 * Underscores are STRIPPED, not escaped. They are the corpus's italic markers
 * and these cells are plain-text summaries; rendering literal underscores would
 * be worse than dropping the emphasis.
 */
export function escapeCell(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/_/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}
