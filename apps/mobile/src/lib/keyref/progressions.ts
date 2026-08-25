import { parseChordToken } from './render'
import type { Progression, ProgressionSet } from './types'

// The two progression sets, written in canonical text and parsed once at module
// load so the data reads the way a musician writes it while the runtime model
// stays structural. `///` separates phrases.
//
// Nothing here is key-specific: these are scale degrees, and the letters are a
// view (render.ts). A bare `7` would mean the vii° chord, so every dominant
// inversion is written `5/7` — see the note in render.ts about the shorthand the
// parser deliberately refuses.

/** `'6 – 5/7 – 1 /// 6 – 5/7 – 1'` → phrases of parsed chords. */
function phrases(source: string) {
  return source
    .split('///')
    .map((phrase) => ({
      chords: phrase
        .split('–')
        .map((token) => token.trim())
        .filter(Boolean)
        .map(parseChordToken),
    }))
    .filter((p) => p.chords.length > 0)
}

function progression(
  set: ProgressionSet,
  id: string,
  source: string,
  noteKey?: string,
): Progression {
  return { id, set, labelKey: `keyRef.progressions.${id}`, noteKey, phrases: phrases(source) }
}

/**
 * General — sixteen diatonic progressions weighted toward congregational
 * worship rather than generic pop. The order is roughly "most reached for
 * first"; the eight-chord Canon entry is last of the four-bar shapes because it
 * is a whole form rather than a loop.
 */
export const GENERAL_PROGRESSIONS: Progression[] = [
  progression('general', 'g1564', '1 – 5 – 6 – 4'),
  progression('general', 'g145', '1 – 4 – 5'),
  progression('general', 'g6415', '6 – 4 – 1 – 5'),
  progression('general', 'g154', '1 – 5 – 4'),
  progression('general', 'g4156', '4 – 1 – 5 – 6'),
  progression('general', 'g1645', '1 – 6 – 4 – 5'),
  progression('general', 'g1465', '1 – 4 – 6 – 5'),
  progression('general', 'g251', '2 – 5 – 1'),
  progression('general', 'g1415', '1 – 4 – 1 – 5'),
  progression('general', 'g1345', '1 – 3 – 4 – 5'),
  progression('general', 'g4536', '4 – 5 – 3 – 6'),
  progression('general', 'g6545', '6 – 5 – 4 – 5'),
  progression('general', 'gCanon', '1 – 5 – 6 – 3 – 4 – 1 – 4 – 5'),
  progression('general', 'g6451', '6 – 4 – 5 – 1'),
  progression('general', 'g1454', '1 – 4 – 5 – 4'),
  progression('general', 'g1625', '1 – 6 – 2 – 5'),
]

/**
 * Prayer — the ministry's own guidelines, grouped by function and encoded as
 * written, including the slash chords the set is built around and the
 * non-diatonic `2maj` in "Pushing through".
 *
 * Two of them carry a playing note from the source. Those notes are guidance for
 * the player, not chords, so they are `noteKey`s surfaced through the note sheet
 * rather than extra data in the sequence.
 */
export const PRAYER_PROGRESSIONS: Progression[] = [
  progression('prayer', 'pTopics', '1/3 – 4 – 6 – 5 – 4 – 1/3 – 2 – 5'),
  progression('prayer', 'pTopicsAlt', '1/3 – 4 – 6 – 5 – 2 – 1/3 – 4 – 5'),
  progression('prayer', 'pBasic', '4 – 1/3 – 2 – 1/4 – 1/3 – 2 – 5'),
  progression('prayer', 'pClimax', '1 – 4/6 – 5 – 2 – 4 – 1/3 – 2 – 5', 'keyRef.notes.pClimax'),
  progression('prayer', 'pRepentance', '6 – 1/5 – 4 – 1/3 – 6 – 1/5 – 4 – 5'),
  progression('prayer', 'pRepentanceAlt', '6 – 1/5 – 4 – 1/3 – 2 – 1/3 – 4 – 5'),
  progression('prayer', 'pFull', '6 – 5/7 – 1 /// 6 – 5/7 – 1'),
  progression('prayer', 'pFullAlt', '6 – 5/7 – 1 /// 2 – 5'),
  progression('prayer', 'pBuildUp', '4 – 5 – 6 – 4 – 5 – 6 – 2 – 5'),
  progression(
    'prayer',
    'pPushing',
    '1/3 – 4 – 6 – 2maj – 4 – 1/3 – 2 – 5',
    'keyRef.notes.pPushing',
  ),
  progression('prayer', 'pRequest', '1/3 – 4 – 6 – 5'),
  progression('prayer', 'pRequestAlt', '6 – 4 – 1 – 5'),
  progression('prayer', 'pBright', '4 – 1/3 – 2 – 5'),
  progression('prayer', 'pIntense', '6 – 4 – 1 /// 6 – 4 – 1 /// 6 – 4 – 1 – 2 – 4 – 5'),
]

export const ALL_PROGRESSIONS: Progression[] = [...GENERAL_PROGRESSIONS, ...PRAYER_PROGRESSIONS]

const BY_ID = new Map(ALL_PROGRESSIONS.map((p) => [p.id, p]))

/** Look up a progression by persisted id. Unknown ids resolve to null. */
export function progressionById(id: string | null | undefined): Progression | null {
  return id ? (BY_ID.get(id) ?? null) : null
}

/** The four slots a fresh install starts with: one per functional family. */
export const DEFAULT_PINNED: (string | null)[] = ['g1564', 'g145', 'pRequest', 'pFull']

/** Every chord in a progression, phrase boundaries flattened away. */
export function flatChords(progression: Progression) {
  return progression.phrases.flatMap((p) => p.chords)
}
