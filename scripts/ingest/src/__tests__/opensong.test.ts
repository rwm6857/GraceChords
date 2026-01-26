import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { extractOpenSong } from '../extractors/opensong.js'
import { buildDraft } from '../ingest.js'

const withChordsPath = fileURLToPath(
  new URL('../../fixtures/opensong/opensong_with_chords.xmltxt', import.meta.url)
)
const noChordsPath = fileURLToPath(
  new URL('../../fixtures/opensong/opensong_no_chords.xmltxt', import.meta.url)
)
const missingTitlePath = fileURLToPath(
  new URL('../../fixtures/opensong/opensong_missing_title.xmltxt', import.meta.url)
)

describe('extractOpenSong', () => {
  it('extracts metadata, preserves sections, and strips leading dots', async () => {
    const result = await extractOpenSong(withChordsPath)
    expect(result.meta?.title).toBe('He knows my & name')
    expect(result.meta?.authors).toEqual(['Jane Doe', 'John Doe'])
    expect(result.meta?.key).toBe('D')
    expect(result.meta?.presentation).toBe('V1 V2 C')
    const firstContent = result.lines.find((line) => line.text.trim().length > 0)
    expect(firstContent?.text).toBe('[V1]')
    const firstChordLine = result.lines.find((line) => line.text.includes('E  F#m'))
    expect(firstChordLine?.text.startsWith('.')).toBe(false)
    const makerLine = result.lines.find((line) => line.text.includes('Maker'))
    expect(makerLine?.text).toBe('I have a Maker')
    const dottedChord = result.lines.find((line) => line.text.includes('G/D'))
    expect(dottedChord?.text.includes('G/D.')).toBe(false)
  })

  it('falls back to filename when title is missing', async () => {
    const result = await extractOpenSong(missingTitlePath)
    expect(result.meta?.title).toBe('opensong missing title')
  })
})

describe('OpenSong buildDraft integration', () => {
  it('inlines chords when chord line precedes lyric line', async () => {
    const result = await extractOpenSong(withChordsPath)
    const draft = buildDraft(
      result.lines,
      {
        title: result.meta?.title,
        authors: result.meta?.authors?.join(', '),
        key: result.meta?.key,
        presentation: result.meta?.presentation
      },
      []
    )
    expect(draft.text).toContain('[E]')
    expect(draft.text).toContain('Maker')
  })

  it('does not insert chords when none are present', async () => {
    const result = await extractOpenSong(noChordsPath)
    const draft = buildDraft(
      result.lines,
      {
        title: result.meta?.title,
        authors: result.meta?.authors?.join(', '),
        key: result.meta?.key,
        presentation: result.meta?.presentation
      },
      []
    )
    expect(/\[[A-G][^]]*\]/.test(draft.text)).toBe(false)
  })
})
