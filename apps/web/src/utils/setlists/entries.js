// Shared shape for a setlist entry in the builder, plus the catalog lookups
// both persistence hooks need. Kept out of the hooks so the Supabase-backed and
// draft builders can't drift on how a row is identified or displayed.
import { isVerseId, parseVerseId } from '@gracechords/core'

/**
 * @typedef {object} EntrySong
 * @property {string} id           Opaque entry id (uuid | `personal:<uuid>` | `v:...`)
 * @property {string} slug         Catalog slug; '' for a verse
 * @property {string} title
 * @property {string|null} artist
 * @property {string|null} default_key
 * @property {number|null} tempo
 * @property {string|null} time_signature
 */

/**
 * @typedef {object} SetlistItem
 * @property {string} entryKey  Stable local list key — DB row ids are wiped every save
 * @property {string} songId
 * @property {string|null} toKey  setlist_songs.key_override; null = the song's own key
 * @property {EntrySong} song
 */

let nextKey = 0

/** A list key that survives reorders, unlike the DB row id or the array index. */
export function makeEntryKey(songId) {
  nextKey += 1
  return `${songId}:${nextKey}`
}

/** Map a web catalog song (slug as `id`, uuid as `dbId`) to an entry's song. */
export function entrySongFromCatalog(song) {
  if (!song) return null
  return {
    id: song.dbId || song.id,
    slug: song.id,
    title: song.title,
    artist: (song.authors && song.authors.join(', ')) || null,
    default_key: song.originalKey || null,
    tempo: song.tempo ?? null,
    time_signature: song.timeSignature || null,
  }
}

/** The key an entry is actually played in: its override, else the song's own. */
export function effectiveEntryKey(item) {
  if (!item) return null
  return item.toKey || (item.song && item.song.default_key) || null
}

/**
 * Working entries hydrated for display.
 *
 * An entry whose song resolves to nothing is KEPT in the caller's working state
 * but dropped here, so a wipe-and-replace save never silently erases a song
 * that is merely missing from the catalog (soft-deleted, or not yet loaded).
 * That is also why every mutation is keyed by `entryKey` and never by the
 * rendered index: rendered and stored positions can diverge.
 *
 * @param {Array<{entryKey: string, songId: string, toKey: string|null, song: EntrySong|null}>} entries
 * @param {{ byDbId?: Map<string, any>, byId?: Map<string, any> }} catalog
 * @returns {SetlistItem[]}
 */
export function toWorkingItems(entries, catalog) {
  const byDbId = (catalog && catalog.byDbId) || new Map()
  const byId = (catalog && catalog.byId) || new Map()
  const out = []
  for (const entry of entries || []) {
    // A verse has no catalog song — synthesize one from the parsed reference so
    // verse entries survive instead of being filtered out.
    if (isVerseId(entry.songId)) {
      const parsed = parseVerseId(entry.songId)
      out.push({
        entryKey: entry.entryKey,
        songId: entry.songId,
        toKey: entry.toKey,
        song: {
          id: entry.songId,
          slug: '',
          // Empty when the reference won't parse; SetTable substitutes a
          // translated label rather than an English literal from a util.
          title: (parsed && parsed.refDisplay) || '',
          artist: null,
          default_key: null,
          tempo: null,
          time_signature: null,
          verse: true,
          translation: (parsed && parsed.translation) || null,
        },
      })
      continue
    }
    // Prefer the song embedded by the setlist fetch; fall back to the catalog
    // by uuid, then by slug (draft entries are keyed by slug).
    const catalogSong = byDbId.get(entry.songId) || byId.get(entry.songId)
    const song = entry.song || entrySongFromCatalog(catalogSong)
    if (!song) continue
    out.push({ entryKey: entry.entryKey, songId: entry.songId, toKey: entry.toKey, song })
  }
  return out
}
