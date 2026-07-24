// Bridge entry for the GraceChords Studio JavaScriptCore context.
//
// Imports the chordpro subpath, NOT the '@gracechords/core' barrel: the barrel
// re-exports supabase/client.js, which would pull @supabase/supabase-js — and
// its fetch/WebSocket/storage expectations — into an engine that has none of
// them. chordpro/index.js has zero imports, so this bundle stays dependency-free.
import { transposeSymPrefer } from '@gracechords/core/chordpro/index.js'

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

function describe(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return `'${value}'`
  return `${typeof value} ${String(value)}`
}
