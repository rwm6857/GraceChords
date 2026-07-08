import { describe, it, expect } from 'vitest'
import {
  BLANK_SONG_FORM,
  validateSongForm,
  hasFormErrors,
  songRowToForm,
  formToSongRow,
  normalizeYoutubeInput,
  computeTapTempoBpm,
  canonicalizeForm,
} from '@gracechords/core'

describe('validateSongForm', () => {
  it('flags missing title, key, and tags', () => {
    const errors = validateSongForm(BLANK_SONG_FORM)
    expect(errors.title).toBeTruthy()
    expect(errors.default_key).toBeTruthy()
    expect(errors.tags).toBeTruthy()
    expect(hasFormErrors(errors)).toBe(true)
  })

  it('passes a complete form', () => {
    const errors = validateSongForm({ title: 'A', default_key: 'G', tags: ['hymn'] })
    expect(hasFormErrors(errors)).toBe(false)
  })
})

describe('formToSongRow', () => {
  it('coalesces empties to null but keeps chordpro_content as ""', () => {
    const row = formToSongRow({ ...BLANK_SONG_FORM, title: 'Song', tags: ['x'] })
    expect(row.title).toBe('Song')
    expect(row.artist).toBeNull()
    expect(row.tempo).toBeNull()
    expect(row.tags).toEqual(['x'])
    expect(row.chordpro_content).toBe('') // NOT null — column is NOT NULL
  })
})

describe('songRowToForm', () => {
  it('round-trips through formToSongRow', () => {
    const form = songRowToForm({
      title: 'T', artist: 'A', default_key: 'C', tempo: 90,
      time_signature: '4/4', tags: ['a', 'b'], chordpro_content: '[C]hi',
    })
    expect(form.title).toBe('T')
    expect(form.tempo).toBe(90)
    expect(form.tags).toEqual(['a', 'b'])
    const row = formToSongRow(form)
    expect(row.chordpro_content).toBe('[C]hi')
  })
})

describe('normalizeYoutubeInput', () => {
  it('accepts a bare 11-char id', () => {
    expect(normalizeYoutubeInput('dQw4w9WgXcQ')).toEqual({ id: 'dQw4w9WgXcQ', valid: true })
  })
  it('extracts from watch / youtu.be / shorts urls', () => {
    expect(normalizeYoutubeInput('https://youtube.com/watch?v=dQw4w9WgXcQ').id).toBe('dQw4w9WgXcQ')
    expect(normalizeYoutubeInput('https://youtu.be/dQw4w9WgXcQ').id).toBe('dQw4w9WgXcQ')
  })
  it('marks unparseable input invalid', () => {
    expect(normalizeYoutubeInput('not a video').valid).toBe(false)
  })
})

describe('computeTapTempoBpm', () => {
  it('returns null for fewer than 2 taps', () => {
    expect(computeTapTempoBpm([1000])).toBeNull()
  })
  it('computes 120 BPM from 500ms intervals', () => {
    expect(computeTapTempoBpm([0, 500, 1000, 1500])).toBe(120)
  })
  it('rejects out-of-range results', () => {
    expect(computeTapTempoBpm([0, 10])).toBeNull() // 6000 BPM
  })
})

describe('canonicalizeForm', () => {
  it('normalizes the body without injecting metadata', () => {
    const form = { ...BLANK_SONG_FORM, title: 'T', default_key: 'G', tags: ['x'], chordpro_content: 'Verse 1\n[G]hi' }
    const out = canonicalizeForm(form)
    expect(out.chordpro_content).toMatch(/\{start_of_verse/)
    expect(out.chordpro_content).not.toMatch(/\{title/)
    expect(out.chordpro_content).not.toMatch(/\{key/)
  })
  it('leaves an empty body untouched', () => {
    const form = { ...BLANK_SONG_FORM, chordpro_content: '' }
    expect(canonicalizeForm(form).chordpro_content).toBe('')
  })
})
