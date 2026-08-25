// Correctly-spelled scale-degree notes for a key, derived from the diatonic
// chord table rather than from a second spelling table of its own.
//
// Two gaps this fills, both of which otherwise force callers to re-derive note
// spelling by hand:
//
//  • `keyRoot()` (chordpro/index.js) NORMALIZES to sharps — keyRoot('Bb') is
//    'A#'. That is right for comparing keys and wrong for showing one, so it
//    cannot be used to label a chord. `chordRoot()` preserves the spelling.
//  • Nothing exposes "the note on degree n of key K". It exists only implicitly
//    inside MAJOR_DIATONIC, whose entries already carry the conventional
//    spelling for every key (Db's 4 is Gb, not F#).
//
// Slash-chord bass notes are the motivating case: `1/3` has to render A/C# in A,
// G/B in G and F/A in F, which is exactly degree 3 of each key.

import { getDiatonicChords } from './diatonicChords'

type DiatonicChord = { degree: string; symbol: string; display: string }

// Double accidentals are matched because a degree spelling can legitimately need
// one in a theoretical key; the shipped table never produces them.
const ROOT_RE = /^([A-G](?:#{1,2}|b{1,2})?)/

/**
 * The root of a chord symbol, SPELLED AS WRITTEN.
 *
 *   chordRoot('Bbm')  === 'Bb'   (keyRoot would say 'A#')
 *   chordRoot('C#dim')=== 'C#'
 *   chordRoot('G/B')  === 'G'
 *
 * Returns '' for anything that does not start with a note name.
 */
export function chordRoot(sym: string): string {
  const m = ROOT_RE.exec(String(sym ?? '').trim())
  return m ? m[1] : ''
}

/**
 * The seven scale-degree notes of `key`, in degree order, spelled for that key.
 *
 *   scaleDegreeNotes('A')  → ['A','B','C#','D','E','F#','G#']
 *   scaleDegreeNotes('Db') → ['Db','Eb','F','Gb','Ab','Bb','C']
 *
 * Minor keys work too (the natural-minor scale, since getDiatonicChords rotates
 * to the relative minor). Returns null for an unrecognized key.
 *
 * Note this reads each chord's `symbol`, not its `display`. They disagree on
 * exactly one entry — F#'s degree 7 is symbol 'E#dim' / display 'Fdim' — and the
 * symbol is the one that spells a chord correctly: the 5/7 of F# is C#/E#, not
 * C#/F.
 */
export function scaleDegreeNotes(key: string): string[] | null {
  const chords = getDiatonicChords(key) as DiatonicChord[] | null
  if (!chords || chords.length !== 7) return null
  const notes = chords.map((c) => chordRoot(c.symbol))
  return notes.some((n) => !n) ? null : notes
}
