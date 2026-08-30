// The Key Reference progression model.
//
// Progressions are stored NUMERICALLY and are key-independent: a progression is
// a sequence of scale degrees, and the letter names are a view computed at
// render time from the selected key. No letter name may appear anywhere in this
// layer — see render.ts for the only place degrees become notes.

/** Scale degree, 1–7. */
export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Set only when the chord DEPARTS from its diatonic default. Absent means
 * diatonic, so `{ degree: 2 }` in a major key is the minor ii and
 * `{ degree: 2, quality: 'maj' }` is the borrowed II.
 */
export type QualityOverride = 'maj' | 'min' | 'dim'

/** Chord extensions the source material calls for. */
export type Extension = '7' | '9'

export type ProgressionChord = {
  degree: Degree
  quality?: QualityOverride
  /**
   * Scale degree in the BASS, for slash chords: `{ degree: 1, bass: 3 }` is
   * `1/3` — the I chord with the third in the bass. Absent means root position.
   */
  bass?: Degree
  extension?: Extension
}

/**
 * One ordered group of chords. Most progressions are a single phrase; the
 * multi-phrase ones exist to preserve groupings like
 * `6 – 5/7 – 1 /// 6 – 5/7 – 1`, which read as a repeated figure rather than a
 * six-chord run.
 */
export type Phrase = { chords: ProgressionChord[] }

export type ProgressionSet = 'general' | 'prayer'

export type Progression = {
  /** Stable id — this is what the pinned-slot preference persists. */
  id: string
  set: ProgressionSet
  /** i18n key under the `utilities` namespace. Never a literal string. */
  labelKey: string
  /**
   * i18n key for a playing note carried over from the source document (e.g.
   * "add the 9th on 4/6"). Surfaced as a note affordance, deliberately NOT
   * encoded as playable data.
   */
  noteKey?: string
  phrases: Phrase[]
}

/**
 * How chords are written on screen. Persisted.
 *
 * `numbers` is the canonical Nashville form the data is stored in (`1`, `5/7`,
 * `2maj`); `nashville` is roman-numeral analysis (`I`, `V/7`, `II`), where the
 * case of the numeral carries the quality. The segment is labelled "Nashville"
 * because that is what the team calls it, though strictly Nashville numbering is
 * the Arabic one.
 */
export type DisplayMode = 'letters' | 'numbers' | 'nashville'
