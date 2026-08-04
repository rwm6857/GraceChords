// Bridge entry for the GraceChords Studio JavaScriptCore context.
//
// Imports the chordpro subpath, NOT the '@gracechords/core' barrel: the barrel
// re-exports supabase/client.js, which would pull @supabase/supabase-js — and
// its fetch/WebSocket/storage expectations — into an engine that has none of
// them. chordpro/index.js has zero imports, so this bundle stays dependency-free.
import { stepsBetween as coreStepsBetween, transposeSymPrefer } from '@gracechords/core/chordpro/index.js'
import { formatChord, formatKeyDisplay } from '@gracechords/core/chordpro/solfege.js'
import { parseChordProOrLegacy } from '@gracechords/core/chordpro/parser.ts'
import { lintChordPro } from '@gracechords/core/chordpro/lint.ts'
import { transposeInstrumental } from '@gracechords/core/songs/instrumental.js'
import { hasMinRole as coreHasMinRole, ROLE_ORDER } from '@gracechords/core/rbac/roles.js'
import { slugify as coreSlugify } from '@gracechords/core/songs/slug.ts'
import {
  CHORD_VARIANTS,
  SECTION_PRESETS,
  chordInsertToken,
  insertAtCursor as coreInsertAtCursor,
  wrapSection as coreWrapSection,
} from '@gracechords/core/chordpro/editing.ts'
import { getDiatonicChords } from '@gracechords/core/chordpro/diatonicChords.js'
import { buildSongDraft } from '@gracechords/core/songs/pdfImport.ts'

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

/**
 * Lint a ChordPro body through `packages/core`'s `lintChordPro`, returned as a
 * JSON array string.
 *
 * Warnings only — every code core emits is `warn:*` and there is no severity
 * field, because the module is advisory: it flags a missing {key}, an empty
 * section, an over-long lyric line, a suspicious chord symbol, and unbalanced
 * {start_of_*}/{end_of_*} pairs. A body the parser cannot handle at all is a
 * different mechanism entirely — `parseToJSON` throws, and the caller falls back
 * to raw text — so the editor surfaces the two separately rather than pretending
 * lint returns errors.
 *
 * The string overload is passed through deliberately: core only runs its
 * unbalanced-directive scan when given raw text, so linting the editor's buffer
 * catches strictly more than linting an already-parsed document would.
 *
 * @param {string} chordpro
 * @returns {string} JSON-encoded LintWarning[] (see packages/core/src/chordpro/lint.ts)
 */
export function lintToJSON(chordpro) {
  if (typeof chordpro !== 'string') {
    throw new TypeError(`lintToJSON: chordpro must be a string, got ${describe(chordpro)}`)
  }
  return JSON.stringify(lintChordPro(chordpro))
}

/**
 * Role-hierarchy check through `packages/core`'s `hasMinRole`.
 *
 * Bridged rather than ported to Swift because AGENTS.md makes rbac/roles.js the
 * single source of truth for gate checks, and a hand-written Swift copy of
 * ROLE_ORDER is exactly the kind of thing that silently outlives a hierarchy
 * change — `collaborator` was removed from this list in 2026-07 and the root
 * AGENTS.md table still has not caught up.
 *
 * Core's own tolerance is preserved: an unknown or empty `userRole` is treated as
 * 'user' rather than rejected, so the caller can ask before the role has loaded.
 * An unknown `minRole` returns false.
 *
 * @param {string} userRole
 * @param {string} minRole  one of ROLE_ORDER
 * @returns {boolean}
 */
export function hasMinRole(userRole, minRole) {
  if (typeof userRole !== 'string') {
    throw new TypeError(`hasMinRole: userRole must be a string, got ${describe(userRole)}`)
  }
  requireString('hasMinRole', 'minRole', minRole)
  return coreHasMinRole(userRole, minRole)
}

/** The role hierarchy, lowest privilege first, as a JSON array string. */
export function roleOrderJSON() {
  return JSON.stringify(ROLE_ORDER)
}

/**
 * Title → URL-safe slug through `packages/core`'s `slugify`.
 *
 * Bridged rather than reimplemented because the slug is the song's public URL on
 * gracechords.com: a Swift regex that differed from core's by one character class
 * would mint Studio-shaped slugs that no other client produces, and the drift
 * would only show up as a wrong link. Returns '' for a title with no
 * alphanumerics, which is core's signal that no slug can be derived — the caller
 * must not write a row in that case (`songs.slug` is UNIQUE NOT NULL).
 *
 * Collision resolution stays on the Swift side: core's `deriveUniqueSlug` needs a
 * Supabase client to probe the table, and this context has no network.
 *
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  if (typeof title !== 'string') {
    throw new TypeError(`slugify: title must be a string, got ${describe(title)}`)
  }
  return coreSlugify(title)
}

/**
 * Insert `text` at the caret, replacing any selection, through core's
 * `insertAtCursor`. Offsets are UTF-16 code units, which is what a JS string index
 * is — the Swift side converts, since Swift's native String indices count graphemes
 * and would disagree on any Turkish or Korean lyric.
 *
 * @param {string} value
 * @param {number} start
 * @param {number} end
 * @param {string} text
 * @returns {string} JSON `{ value, selection: { start, end } }`
 */
export function insertAtCursorJSON(value, start, end, text) {
  requireEditArgs('insertAtCursorJSON', value, start, end)
  if (typeof text !== 'string') {
    throw new TypeError(`insertAtCursorJSON: text must be a string, got ${describe(text)}`)
  }
  return JSON.stringify(coreInsertAtCursor(value, { start, end }, text))
}

/**
 * Wrap the selection in `{start_of_<directive>: <label>}` … `{end_of_<directive>}`
 * through core's `wrapSection`. With no selection it inserts an empty block and puts
 * the caret on the blank content line — the behaviour that makes the section buttons
 * useful before any lyrics exist.
 *
 * @returns {string} JSON `{ value, selection: { start, end } }`
 */
export function wrapSectionJSON(value, start, end, directive, label) {
  requireEditArgs('wrapSectionJSON', value, start, end)
  requireString('wrapSectionJSON', 'directive', directive)
  if (typeof label !== 'string') {
    throw new TypeError(`wrapSectionJSON: label must be a string, got ${describe(label)}`)
  }
  return JSON.stringify(coreWrapSection(value, { start, end }, { directive, label }))
}

/**
 * The section buttons, as JSON. Comes from core so Studio cannot drift from the web
 * editor on the one non-obvious rule encoded there: the parser only accepts
 * verse|chorus|bridge|intro|tag|outro, so Pre-Chorus and Interlude are emitted as
 * NAMED choruses rather than directives the parser would silently drop.
 */
export function sectionPresetsJSON() {
  return JSON.stringify(SECTION_PRESETS)
}

/** The seven diatonic chords for `key`, as JSON, or `null` for an unknown key. */
export function diatonicChordsJSON(key) {
  if (typeof key !== 'string') {
    throw new TypeError(`diatonicChordsJSON: key must be a string, got ${describe(key)}`)
  }
  return JSON.stringify(getDiatonicChords(key))
}

/** Suffixes offered on a chord button, as JSON — core's CHORD_VARIANTS. */
export function chordVariantsJSON() {
  return JSON.stringify(CHORD_VARIANTS)
}

/** `"G"` → `"[G]"`, through core, so the token shape lives in one place. */
export function chordToken(symbol) {
  requireString('chordToken', 'symbol', symbol)
  return chordInsertToken(symbol)
}

/**
 * Positioned chord-sheet text → a song draft, as JSON.
 *
 * Studio extracts the geometry natively with PDFKit and hands it over as JSON
 * rather than as a JSValue tree, for the same reason `parseToJSON` does: the whole
 * nested structure crosses in one step and decodes through JSONDecoder. The
 * heuristics live in core rather than Swift because they are pure string and
 * geometry math with no platform in them, Studio has no test target to cover them
 * with, and a web importer feeding pdf.js output into the same function would get
 * byte-identical drafts.
 *
 * The argument is a JSON *string*, not an object: a JSValue tree built from a Swift
 * dictionary arrives with numbers boxed inconsistently across SDKs, and the
 * document is a few thousand rects for a long chart — one parse is cheaper and has
 * one failure mode instead of a per-node one.
 *
 * @param {string} extractionJSON  JSON-encoded ExtractedDocument
 * @returns {string} JSON-encoded SongDraft (see packages/core/src/songs/pdfImport.ts)
 */
export function pdfDraftJSON(extractionJSON) {
  if (typeof extractionJSON !== 'string' || extractionJSON.length === 0) {
    throw new TypeError(`pdfDraftJSON: extractionJSON must be a non-empty string, got ${describe(extractionJSON)}`)
  }
  let doc
  try {
    doc = JSON.parse(extractionJSON)
  } catch (err) {
    throw new TypeError(`pdfDraftJSON: extractionJSON is not valid JSON — ${err.message}`)
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.lines) || !Array.isArray(doc.pages)) {
    throw new TypeError('pdfDraftJSON: extractionJSON must decode to { lines: [], pages: [] }')
  }
  return JSON.stringify(buildSongDraft(doc))
}

function requireEditArgs(fn, value, start, end) {
  if (typeof value !== 'string') {
    throw new TypeError(`${fn}: value must be a string, got ${describe(value)}`)
  }
  for (const [name, n] of [['start', start], ['end', end]]) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      throw new TypeError(`${fn}: ${name} must be a non-negative integer, got ${describe(n)}`)
    }
  }
  if (start > end) {
    throw new TypeError(`${fn}: start (${start}) must not exceed end (${end})`)
  }
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
