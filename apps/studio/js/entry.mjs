// Bridge entry for the GraceChords Studio JavaScriptCore context.
//
// Imports the chordpro subpath, NOT the '@gracechords/core' barrel: the barrel
// re-exports supabase/client.js, which would pull @supabase/supabase-js — and
// its fetch/WebSocket/storage expectations — into an engine that has none of
// them. chordpro/index.js has zero imports, so this bundle stays dependency-free.
import { stepsBetween as coreStepsBetween, transposeSymPrefer } from '@gracechords/core/chordpro/index.js'
import { formatChord, formatKeyDisplay } from '@gracechords/core/chordpro/solfege.js'
import { parseChordProOrLegacy } from '@gracechords/core/chordpro/parser.ts'
import { transposeInstrumental } from '@gracechords/core/songs/instrumental.js'

const STYLES = ['letters', 'solfege']

/**
 * Transpose a chord symbol, preserving its original accidental spelling.
 *
 * Argument validation lives here at the bridge boundary, not in core. Once the
 * arguments are known-good the call is passed through verbatim, so Studio gets
 * byte-identical results to apps/mobile — including core's deliberate
 * pass-through of symbols it does not recognize ('H7' transposes to 'H7').
 *
 * @param {string} sym         chord symbol, e.g. 'G', 'Bbm7', 'D/F#'
 * @param {number} steps       semitones, may be negative
 * @param {boolean} preferFlat accidental preference for symbols with no accidental
 * @returns {string}
 */
export function transpose(sym, steps, preferFlat = false) {
  if (typeof sym !== 'string' || sym.length === 0) {
    throw new TypeError(`transpose: sym must be a non-empty string, got ${describe(sym)}`)
  }
  if (typeof steps !== 'number' || !Number.isInteger(steps)) {
    throw new TypeError(`transpose: steps must be an integer, got ${describe(steps)}`)
  }
  if (typeof preferFlat !== 'boolean') {
    throw new TypeError(`transpose: preferFlat must be a boolean, got ${describe(preferFlat)}`)
  }
  return transposeSymPrefer(sym, steps, preferFlat)
}

/**
 * Parse ChordPro (or the legacy plain-header dialect) into a SongDoc, returned as
 * a JSON string.
 *
 * Handing Swift a JSON string rather than a live JSValue tree means the whole
 * nested structure decodes through JSONDecoder in one step, with `undefined`
 * fields simply absent (→ nil) instead of needing per-node type checks.
 *
 * An empty body is legitimate input — it yields a document with no sections.
 *
 * @param {string} chordpro
 * @returns {string} JSON-encoded SongDoc (see packages/core/src/chordpro/types.ts)
 */
export function parseToJSON(chordpro) {
  if (typeof chordpro !== 'string') {
    throw new TypeError(`parseToJSON: chordpro must be a string, got ${describe(chordpro)}`)
  }
  return JSON.stringify(parseChordProOrLegacy(chordpro))
}

/**
 * Semitones from `fromKey` up to `toKey`, 0–11.
 *
 * Studio's transpose model is mobile's: a user delta plus a seed derived from a
 * requested key. Unknown keys yield 0 in core, which is what lets the Viewer
 * render before the key is known instead of guarding every call site.
 *
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {number}
 */
export function stepsBetween(fromKey, toKey) {
  requireString('stepsBetween', 'fromKey', fromKey)
  requireString('stepsBetween', 'toKey', toKey)
  return coreStepsBetween(fromKey, toKey)
}

/**
 * A key as it should be displayed — passed through for 'letters', converted for
 * 'solfege'. Wraps core's formatKeyDisplay so the Viewer's key pill and the key
 * picker read identically to mobile's.
 *
 * @param {string} key
 * @param {'letters'|'solfege'} style
 * @returns {string}
 */
export function formatKey(key, style) {
  requireString('formatKey', 'key', key)
  requireStyle('formatKey', style)
  return formatKeyDisplay(key, style)
}

/**
 * Parse a ChordPro body and apply the Viewer's transpose + chord-style options,
 * returning the same SongDoc shape `parseToJSON` does.
 *
 * One call rather than a JSValue round trip per chord: Swift re-renders on every
 * option change, and a bridge call per symbol would put JavaScriptCore in the
 * middle of a SwiftUI layout pass hundreds of times per song.
 *
 * The composition mirrors apps/mobile's ChordChart.tsx exactly, including its
 * asymmetry — line chords go through `transposeSymPrefer` unconditionally while
 * instrumental specs are transposed by `transposeInstrumental`, which short
 * circuits at 0 steps. Matching mobile matters more than tidying it, so that any
 * behavioral difference between the two is a difference in core, not here.
 *
 * `meta` is deliberately left alone: `meta.key` is the song's *native* key, which
 * the caller needs as the transpose origin, not a display value.
 *
 * @param {string} chordpro
 * @param {number} steps       semitones, may be negative
 * @param {boolean} preferFlat
 * @param {'letters'|'solfege'} style
 * @returns {string} JSON-encoded SongDoc with display-ready chord symbols
 */
export function renderToJSON(chordpro, steps, preferFlat, style) {
  if (typeof chordpro !== 'string') {
    throw new TypeError(`renderToJSON: chordpro must be a string, got ${describe(chordpro)}`)
  }
  if (typeof steps !== 'number' || !Number.isInteger(steps)) {
    throw new TypeError(`renderToJSON: steps must be an integer, got ${describe(steps)}`)
  }
  if (typeof preferFlat !== 'boolean') {
    throw new TypeError(`renderToJSON: preferFlat must be a boolean, got ${describe(preferFlat)}`)
  }
  requireStyle('renderToJSON', style)

  const doc = parseChordProOrLegacy(chordpro)
  for (const section of doc.sections ?? []) {
    // The parser records an instrumental directive on both the section and the
    // line it opens. Mobile renders only the line; both are mapped here so the
    // document stays internally consistent for any future caller.
    if (section.instrumental) {
      section.instrumental = transposeInstrumental(section.instrumental, steps, preferFlat, { style })
    }
    for (const line of section.lines ?? []) {
      if (line.instrumental) {
        line.instrumental = transposeInstrumental(line.instrumental, steps, preferFlat, { style })
      }
      if (line.chords?.length) {
        line.chords = line.chords.map((chord) => ({
          ...chord,
          sym: formatChord(transposeSymPrefer(chord.sym, steps, preferFlat), { style }),
        }))
      }
    }
  }
  return JSON.stringify(doc)
}

function requireString(fn, name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${fn}: ${name} must be a non-empty string, got ${describe(value)}`)
  }
}

function requireStyle(fn, style) {
  if (!STYLES.includes(style)) {
    throw new TypeError(`${fn}: style must be one of ${STYLES.join('|')}, got ${describe(style)}`)
  }
}

function describe(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return `'${value}'`
  return `${typeof value} ${String(value)}`
}
