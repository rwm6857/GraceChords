import { appendDisclaimerIfMissing } from '../chordpro/disclaimer'

// Slugs are DB-unique, but they still reach a zip's path table, so strip
// anything that could escape the archive root or break on a filesystem.
function safeBaseName(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
}

/**
 * Turn song rows into `{ path, content }` entries for downloadZip(): one
 * `<slug>.pro` per song, carrying the same disclaimer-appended ChordPro body
 * the Song Viewer's single-song download produces.
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
      content: appendDisclaimerIfMissing(song?.chordpro_content || ''),
    })
  }
  return files
}

export function chordProArchiveName(date = new Date()) {
  return `gracechords-chordpro-${date.toISOString().slice(0, 10)}.zip`
}
