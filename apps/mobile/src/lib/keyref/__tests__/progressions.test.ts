import { describe, expect, it } from 'vitest'
import {
  ALL_PROGRESSIONS,
  DEFAULT_PINNED,
  GENERAL_PROGRESSIONS,
  PRAYER_PROGRESSIONS,
  flatChords,
  progressionById,
} from '../progressions'
import { chordLabel, formatChordToken, isDiatonic } from '../render'
import en from '../../../i18n/locales/en/utilities.json'

const shorthand = (id: string) =>
  progressionById(id)!
    .phrases.map((p) => p.chords.map(formatChordToken).join(' – '))
    .join(' /// ')

describe('progression sets', () => {
  it('ships nineteen General and fourteen Prayer progressions', () => {
    expect(GENERAL_PROGRESSIONS).toHaveLength(19)
    expect(PRAYER_PROGRESSIONS).toHaveLength(14)
  })

  it('has a real label for every progression, and no orphan labels', () => {
    // The data carries only i18n keys, so a progression whose label was never
    // written would render the raw key on screen rather than fail anywhere.
    const labels = en.keyRef.progressions as Record<string, string>
    expect(Object.keys(labels).sort()).toEqual(ALL_PROGRESSIONS.map((p) => p.id).sort())
    for (const value of Object.values(labels)) expect(value.trim()).not.toBe('')
  })

  it('gives every progression a unique id and an i18n label key', () => {
    const ids = ALL_PROGRESSIONS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of ALL_PROGRESSIONS) {
      expect(p.labelKey).toBe(`keyRef.progressions.${p.id}`)
    }
  })

  it('carries no letter names in the data layer', () => {
    // Every chord is a degree plus modifiers; nothing here knows about a key.
    for (const chord of ALL_PROGRESSIONS.flatMap(flatChords)) {
      expect(chord.degree).toBeGreaterThanOrEqual(1)
      expect(chord.degree).toBeLessThanOrEqual(7)
      expect(JSON.stringify(chord)).not.toMatch(/[A-G]#?b?"/)
    }
  })

  it('pins four slots that all resolve', () => {
    expect(DEFAULT_PINNED).toHaveLength(4)
    for (const id of DEFAULT_PINNED) expect(progressionById(id)).not.toBeNull()
  })

  it('resolves an unknown id to null rather than throwing', () => {
    expect(progressionById('nope')).toBeNull()
    expect(progressionById(null)).toBeNull()
  })
})

describe('the General set', () => {
  it('contains the five required shapes', () => {
    const required = ['1 – 5 – 6 – 4', '1 – 4 – 5', '6 – 4 – 1 – 5', '1 – 5 – 4', '4 – 1 – 5 – 6']
    const present = GENERAL_PROGRESSIONS.map((p) => shorthand(p.id))
    for (const shape of required) expect(present).toContain(shape)
  })

  it('is entirely diatonic, inversions included', () => {
    for (const chord of GENERAL_PROGRESSIONS.flatMap(flatChords)) {
      expect(isDiatonic(chord)).toBe(true)
    }
  })

  it('carries the shapes added by request', () => {
    expect(shorthand('gCcm')).toBe('1 – 4 – 6 – 5')
    expect(shorthand('g3645')).toBe('3 – 6 – 4 – 5')
    expect(shorthand('gDescending')).toBe('1 – 5/7 – 6 – 1/5 – 4 – 1/3 – 2 – 5')
    expect(shorthand('gLoopExit')).toBe('1 – 5 – 6 – 4 /// 4 – 5 – 1')
  })

  it('walks the bass down the scale in the descending entry', () => {
    // The one General entry with inversions, and the whole reason it is here.
    const chords = flatChords(progressionById('gDescending')!)
    expect(chords.map((c) => chordLabel(c, 'G', 'letters'))).toEqual([
      'G', 'D/F#', 'Em', 'G/D', 'C', 'G/B', 'Am', 'D',
    ])
  })
})

describe('the Prayer set', () => {
  it('encodes the ministry guidelines as written', () => {
    expect(shorthand('pTopics')).toBe('1/3 – 4 – 6 – 5 – 4 – 1/3 – 2 – 5')
    expect(shorthand('pTopicsAlt')).toBe('1/3 – 4 – 6 – 5 – 2 – 1/3 – 4 – 5')
    expect(shorthand('pBasic')).toBe('4 – 1/3 – 2 – 1/4 – 1/3 – 2 – 5')
    expect(shorthand('pClimax')).toBe('1 – 4/6 – 5 – 2 – 4 – 1/3 – 2 – 5')
    expect(shorthand('pRepentance')).toBe('6 – 1/5 – 4 – 1/3 – 6 – 1/5 – 4 – 5')
    expect(shorthand('pRepentanceAlt')).toBe('6 – 1/5 – 4 – 1/3 – 2 – 1/3 – 4 – 5')
    expect(shorthand('pBuildUp')).toBe('4 – 5 – 6 – 4 – 5 – 6 – 2 – 5')
    expect(shorthand('pPushing')).toBe('1/3 – 4 – 6 – 2maj – 4 – 1/3 – 2 – 5')
    expect(shorthand('pRequest')).toBe('1/3 – 4 – 6 – 5')
    expect(shorthand('pRequestAlt')).toBe('6 – 4 – 1 – 5')
    expect(shorthand('pBright')).toBe('4 – 1/3 – 2 – 5')
  })

  it('keeps each phrase a phrase', () => {
    expect(shorthand('pFull')).toBe('6 – 5/7 – 1 /// 2 – 4 – 5')
    expect(shorthand('pFullAlt')).toBe('6 – 5/7 – 1 /// 2 – 5')
    expect(shorthand('pIntense')).toBe('6 – 4 – 1 /// 6 – 4 – 1 /// 6 – 4 – 1 – 2 – 4 – 5')
    expect(progressionById('pFull')!.phrases).toHaveLength(2)
    expect(progressionById('pIntense')!.phrases).toHaveLength(3)
  })

  it('stores every dominant inversion as 5/7, never as a bare 7', () => {
    for (const p of PRAYER_PROGRESSIONS) {
      for (const chord of flatChords(p)) {
        if (chord.degree === 7) {
          throw new Error(`${p.id} stores a bare 7, which is the vii° chord`)
        }
      }
    }
    expect(flatChords(progressionById('pFull')!)[1]).toEqual({ degree: 5, bass: 7 })
  })

  it('marks 2maj as the one non-diatonic chord in the set', () => {
    const nonDiatonic = PRAYER_PROGRESSIONS.flatMap((p) =>
      flatChords(p).filter((c) => !isDiatonic(c)).map((c) => `${p.id}:${formatChordToken(c)}`),
    )
    expect(nonDiatonic).toEqual(['pPushing:2maj'])
  })

  it('annotates exactly the two progressions the source annotates', () => {
    const annotated = ALL_PROGRESSIONS.filter((p) => p.noteKey).map((p) => p.id)
    expect(annotated).toEqual(['pClimax', 'pPushing'])
  })

  it('renders its slash chords with the bass spelled for the key', () => {
    const full = flatChords(progressionById('pFull')!)
    expect(full.map((c) => chordLabel(c, 'A', 'letters'))).toEqual([
      'F#m', 'E/G#', 'A', 'Bm', 'D', 'E',
    ])
    expect(full.map((c) => chordLabel(c, 'Db', 'letters'))).toEqual([
      'Bbm', 'Ab/C', 'Db', 'Ebm', 'Gb', 'Ab',
    ])
  })
})
