import { appendDisclaimerIfMissing } from '../chordpro/disclaimer'

// Slugs are DB-unique, but they still reach a zip's path table, so strip
// anything that could escape the archive root or break on a filesystem.
function safeBaseName(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
}

// Matches a {title: …} metadata line anywhere in the body, since the parser
// reads metadata wherever it appears rather than only at the top.
const TITLE_DIRECTIVE_RX = /^[ \t]*\{[ \t]*title[ \t]*:/im

/**
 * Prefix the body with `{title: …}`. Song rows keep title in its own column and
 * canonicalizeForm() deliberately never injects it into `chordpro_content`, so
 * an exported file has no title of its own unless we add one back.
 */
export function withTitleDirective(content, title) {
  const body = String(content || '')
  if (TITLE_DIRECTIVE_RX.test(body)) return body
  const label = String(title || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
  if (!label) return body
  return `{title: ${label}}\n${body.replace(/^\n+/, '')}`
}

/**
 * Turn song rows into `{ path, content }` entries for downloadZip(): one
 * `<slug>.pro` per song, opening with `{title: …}` and carrying the same
 * disclaimer-appended ChordPro body the Song Viewer's single-song download
 * produces.
 */
export function buildChordProArchiveFiles(songs) {
  const seen = new Map()
  const files = []
  for (const song of songs || []) {
    const base = safeBaseName(song?.slug)
    if (!base) continue
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    files.push({
      path: count === 0 ? `${base}.pro` : `${base}-${count + 1}.pro`,
      content: appendDisclaimerIfMissing(withTitleDirective(song?.chordpro_content, song?.title)),
    })
  }
  return files
}

export function chordProArchiveName(date = new Date()) {
  return `gracechords-chordpro-${date.toISOString().slice(0, 10)}.zip`
}
