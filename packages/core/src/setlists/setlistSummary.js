// Pure setlist summary math shared by the mobile builder footer and Home's
// "Last set" card. No song duration exists in the schema, so total time is an
// estimate at a flat minutes-per-song rate (the design demo's default), and
// callers should render it with a tilde ("~25 min").

import { KEYS, normKey } from '../chordpro'

/** Flat minutes-per-song used for the estimated set duration. */
export const EST_MINUTES_PER_SONG = 5

function keyIndex(k) {
  if (!k) return -1
  return KEYS.indexOf(normKey(k))
}

/**
 * The key an entry is actually played in: its setlist-scoped override when
 * set, otherwise the song's native key.
 *
 * @param {{ toKey?: string|null }} entry
 * @param {{ default_key?: string|null }|null|undefined} song
 * @returns {string|null}
 */
export function effectiveKey(entry, song) {
  return (entry && entry.toKey) || (song && song.default_key) || null
}

/**
 * Summarize a set's entries: count, estimated minutes, key range and BPM
 * range. Entries carry `{ toKey, default_key, tempo }` (already joined —
 * see fetchLastSetSummary), or pass `songsById` to resolve default_key/tempo
 * from `{ toKey, song_id }` entries.
 *
 * @param {Array<{ toKey?: string|null, song_id?: string, default_key?: string|null, tempo?: number|null }>} entries
 * @param {Map<string, { default_key?: string|null, tempo?: number|null }>} [songsById]
 * @returns {{ songCount: number, durationMin: number, keys: string|null, keyRange: string|null, bpmRange: string|null }}
 */
export function summarizeSet(entries, songsById) {
  const list = entries || []
  const keys = []
  const bpms = []
  for (const entry of list) {
    const song = songsById ? songsById.get(String(entry.song_id)) : entry
    const key = effectiveKey(entry, song)
    const idx = keyIndex(key)
    if (idx >= 0) keys.push(idx)
    const tempo = song && song.tempo
    if (typeof tempo === 'number' && tempo > 0) bpms.push(tempo)
  }

  // `keys` is the raw range ("G–D" / "G") for badges; `keyRange` the labeled
  // footer segment ("Keys G–D" / "Key G").
  let keysRaw = null
  let keyRange = null
  if (keys.length > 0) {
    const lo = KEYS[Math.min(...keys)]
    const hi = KEYS[Math.max(...keys)]
    keysRaw = lo === hi ? lo : `${lo}–${hi}`
    keyRange = lo === hi ? `Key ${lo}` : `Keys ${lo}–${hi}`
  }

  let bpmRange = null
  if (bpms.length > 0) {
    const lo = Math.min(...bpms)
    const hi = Math.max(...bpms)
    bpmRange = lo === hi ? `${lo} BPM` : `${lo}–${hi} BPM`
  }

  return {
    songCount: list.length,
    durationMin: list.length * EST_MINUTES_PER_SONG,
    keys: keysRaw,
    keyRange,
    bpmRange,
  }
}

/**
 * Render a summary as the footer line, omitting empty segments:
 * "5 songs · ~25 min · Keys G–D · 72–128 BPM".
 *
 * @param {{ songCount: number, durationMin: number, keyRange: string|null, bpmRange: string|null }} summary
 * @returns {string}
 */
export function formatSetSummary(summary) {
  const n = summary.songCount
  return [
    `${n} ${n === 1 ? 'song' : 'songs'}`,
    n > 0 ? `~${summary.durationMin} min` : null,
    summary.keyRange,
    summary.bpmRange,
  ]
    .filter(Boolean)
    .join(' · ')
}
