import { scaleDegreeNotes } from '@gracechords/core'
import { keyAtOffset } from './keyWheel'
import type { ArcRing } from './arcGeometry'
import type { Degree, DisplayMode, Extension, ProgressionChord, QualityOverride } from './types'

// Canonical text form for a progression chord, and the two renderings of it.
//
// The canonical form is `1`, `1/3`, `5/7`, `2maj`, `2m7`: degree, then an
// optional quality override, then an optional extension, then an optional
// `/bass` degree.
//
// THE SLASH FORM IS THE ONLY FORM. A bare `7` means the vii° chord and nothing
// else — it is never shorthand for `5/7`, and a bare `3` is the iii chord, not
// `1/3`. The source document this data came from writes E/G# as both `5/7` and
// `7` and A/C# as both `1/3` and `3`; those were normalized to the slash form on
// ingest. `parseChordToken` is strict rather than forgiving precisely so that a
// future edit reintroducing the shorthand fails loudly instead of silently
// meaning a different chord.

const TOKEN_RE = /^([1-7])(maj|min|m|dim|°)?(7|9)?(?:\/([1-7]))?$/

/** Diatonic quality of each degree of a major scale, by degree index (1-based). */
const DIATONIC_QUALITY: readonly QualityOverride[] = [
  'maj', // 1
  'min', // 2
  'min', // 3
  'maj', // 4
  'maj', // 5
  'min', // 6
  'dim', // 7
]

/** The chord suffix each quality shows in letters mode. */
const QUALITY_SUFFIX: Record<QualityOverride, string> = { maj: '', min: 'm', dim: '°' }

/** The chord suffix each OVERRIDE shows in numbers mode (canonical spelling). */
const QUALITY_TOKEN: Record<QualityOverride, string> = { maj: 'maj', min: 'm', dim: 'dim' }

export function diatonicQuality(degree: Degree): QualityOverride {
  return DIATONIC_QUALITY[degree - 1]
}

/** The chord's effective quality, override or diatonic default. */
export function effectiveQuality(chord: ProgressionChord): QualityOverride {
  return chord.quality ?? diatonicQuality(chord.degree)
}

/**
 * True when the chord is what the key's scale gives you at that degree — i.e.
 * it sits on the arc unaltered. A `2maj` in a major key is NOT diatonic and must
 * be marked; see ProgressionSequence / KeyArc.
 */
export function isDiatonic(chord: ProgressionChord): boolean {
  return chord.quality == null || chord.quality === diatonicQuality(chord.degree)
}

/**
 * Parse a canonical token. Throws on anything unrecognized rather than guessing
 * — see the note above about the shorthand this deliberately refuses.
 */
export function parseChordToken(token: string): ProgressionChord {
  const m = TOKEN_RE.exec(String(token ?? '').trim())
  if (!m) throw new Error(`Not a canonical progression chord: "${token}"`)
  const [, degree, quality, extension, bass] = m
  const chord: ProgressionChord = { degree: Number(degree) as Degree }
  if (quality) {
    chord.quality = quality === 'maj' ? 'maj' : quality === 'dim' || quality === '°' ? 'dim' : 'min'
  }
  if (extension) chord.extension = extension as Extension
  if (bass) chord.bass = Number(bass) as Degree
  return chord
}

/** Serialize back to canonical text. Round-trips with parseChordToken. */
export function formatChordToken(chord: ProgressionChord): string {
  const quality = chord.quality ? QUALITY_TOKEN[chord.quality] : ''
  const extension = chord.extension ?? ''
  const bass = chord.bass ? `/${chord.bass}` : ''
  return `${chord.degree}${quality}${extension}${bass}`
}

/**
 * The chord as shown in the sequence row.
 *
 * `numbers` gives the canonical token. `letters` spells it in `key`, including
 * the bass note of a slash chord — `1/3` is A/C# in A, G/B in G, F/A in F.
 * Falls back to the canonical token if the key is unrecognized, so an unexpected
 * key degrades to a still-correct label rather than to an empty chip.
 */
export function chordLabel(chord: ProgressionChord, key: string, mode: DisplayMode): string {
  if (mode === 'numbers') return formatChordToken(chord)
  const notes = scaleDegreeNotes(key)
  if (!notes) return formatChordToken(chord)
  const root = notes[chord.degree - 1] + QUALITY_SUFFIX[effectiveQuality(chord)] + (chord.extension ?? '')
  return chord.bass ? `${root}/${notes[chord.bass - 1]}` : root
}

/**
 * The bass note under that chord: the root, third or fifth depending on the
 * inversion. This is the point of the slash-chord set — the progressions are
 * defined by their bass movement, which the arc structurally cannot show.
 */
export function bassLabel(chord: ProgressionChord, key: string, mode: DisplayMode): string {
  const degree = chord.bass ?? chord.degree
  if (mode === 'numbers') return String(degree)
  const notes = scaleDegreeNotes(key)
  return notes ? notes[degree - 1] : String(degree)
}

/**
 * Screen-reader text for one cell: the chord, then the note in the bass. The
 * translator is injected so this module stays RN-free and testable, per the
 * convention the other pure src/lib modules follow.
 */
export function chordAccessibilityLabel(
  chord: ProgressionChord,
  key: string,
  mode: DisplayMode,
  t: (key: string, vars: Record<string, string>) => string,
): string {
  const chordText = chordLabel(chord, key, mode)
  if (!chord.bass) return chordText
  return t('keyRef.a11yChordOverBass', { chord: chordText, bass: bassLabel(chord, key, mode) })
}

// ---------------------------------------------------------------------------
// Arc labels
// ---------------------------------------------------------------------------

/** Scale degree at an arc position, or null for positions that aren't degrees. */
export function arcDegreeAt(ring: ArcRing, offset: number): Degree | null {
  if (ring === 'major') {
    if (offset < -1 || offset > 1) return null
    return ([4, 1, 5] as Degree[])[offset + 1]
  }
  // The inner ring runs one further to the right than the outer: ii vi iii vii°.
  if (offset < -1 || offset > 2) return null
  return ([2, 6, 3, 7] as Degree[])[offset + 1]
}

/**
 * What one arc position reads.
 *
 * IV·I·V and their relative minors are scale degrees of the current key, so they
 * carry both a name and a number. The faded neighbours beyond them are NOT: they
 * are the next KEYS around the circle, and the chord a fifth above V is a
 * secondary dominant rather than the diatonic 2. Labelling it "2" would teach
 * that D major is the 2 chord in C, so those positions show the key letter and
 * no number, and act purely as the control that advances the arc.
 *
 * `altered` is the non-diatonic chord occupying this position, if any: its
 * spelling and its canonical token replace the diatonic ones, so a `2maj` reads
 * "D / 2maj" rather than the "Dm / 2" that is not being played.
 */
export function arcPositionLabels(
  tonicKey: string,
  ring: ArcRing,
  offset: number,
  altered?: ProgressionChord,
): { name: string; number: string | null } {
  const degree = arcDegreeAt(ring, offset)
  const notes = scaleDegreeNotes(tonicKey)

  if (degree == null || !notes) {
    // Beyond the diatonic window: the neighbouring key itself, and for the inner
    // ring that key's relative minor (never actually visible at rest — the inner
    // ring stops at ii/vi/iii — but it has to be right for the moment it slides
    // through the edge of a drag).
    const neighbour = keyAtOffset(tonicKey, offset)
    if (ring === 'minor') {
      const neighbourNotes = scaleDegreeNotes(neighbour)
      return { name: neighbourNotes ? `${neighbourNotes[5]}m` : neighbour, number: null }
    }
    return { name: neighbour, number: null }
  }

  if (altered) {
    return {
      name: notes[altered.degree - 1] + QUALITY_SUFFIX[effectiveQuality(altered)] + (altered.extension ?? ''),
      number: formatChordToken({ ...altered, bass: undefined }),
    }
  }

  return {
    name: notes[degree - 1] + QUALITY_SUFFIX[diatonicQuality(degree)],
    number: String(degree),
  }
}
