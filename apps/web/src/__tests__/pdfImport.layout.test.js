// Two-column and multi-page charts: the cases Ryan's corpus actually contains, and
// the ones where a wrong guess produces plausible-looking nonsense rather than an
// obvious mess. Column DETECTION is Swift-side, so these fixtures encode its output
// (`column`, `startsBlock`, `columnCount`) and exercise everything downstream of it.

import { describe, it, expect } from 'vitest'
import { buildSongDraft, parseChordProOrLegacy } from '@gracechords/core'
import { compose, lines, page, LEADING } from './fixtures/positionedText.js'

/** Right-hand column of a US-letter page: past the gutter, no x-overlap with the left. */
const RIGHT = 320

const labels = (draft) => parseChordProOrLegacy(draft.chordpro).sections.map((s) => s.label)

describe('two-column, one page', () => {
  const twoColumn = () =>
    compose(
      [
        // The title spans the gutter, so it belongs to neither column.
        lines([{ text: 'Amazing Grace', fontSize: 18 }, '(Key of G)'], { column: null }),
        lines(
          ['Verse 1', 'G       C', 'Amazing grace how sweet', 'that saved a wretch like me', '', 'Verse 2', 'when we have been there'],
          { column: 0, y0: 60 },
        ),
        lines(['Chorus', 'G       D', 'How sweet the sound of it', '', 'Bridge', 'and on and on it goes'], {
          column: 1,
          x0: RIGHT,
          y0: 60,
        }),
      ],
      [page(0, { columnCount: 2 })],
    )

  it('reads column-major rather than interleaving the two columns', () => {
    const draft = buildSongDraft(twoColumn())
    expect(labels(draft)).toEqual(['Verse 1', 'Verse 2', 'Chorus', 'Bridge'])
  })

  it('takes the title from the gutter-spanning band, not from a column', () => {
    const draft = buildSongDraft(twoColumn())
    expect(draft.title).toBe('Amazing Grace')
    expect(draft.key).toBe('G')
    expect(draft.chordpro).not.toContain('Amazing Grace')
  })

  it('pairs each chord line with the lyrics in its own column', () => {
    const draft = buildSongDraft(twoColumn())
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    const verse = sections.find((s) => s.label === 'Verse 1')
    const chorus = sections.find((s) => s.label === 'Chorus')
    expect(verse.lines[0].lyrics).toBe('Amazing grace how sweet')
    expect(verse.lines[0].chords.map((c) => c.sym)).toEqual(['G', 'C'])
    expect(chorus.lines[0].lyrics).toBe('How sweet the sound of it')
    expect(chorus.lines[0].chords.map((c) => c.sym)).toEqual(['G', 'D'])
  })

  it('refuses to pair a left-column chord line with a right-column lyric line', () => {
    // The single worst failure mode: same y, different column. Without the
    // same-column + x-overlap rule this silently stamps G/C onto the chorus.
    const title = lines([{ text: 'Song', fontSize: 18 }], { column: null })
    const chords = lines(['G       C'], { column: 0, y0: 100 })
    const lyrics = lines(['How sweet the sound of it'], { column: 1, x0: RIGHT, y0: 100 + LEADING })
    lyrics[0].startsBlock = false
    const draft = buildSongDraft(compose([title, chords, lyrics], [page(0, { columnCount: 2 })]))

    expect(draft.chordpro).not.toMatch(/\[G\]How|\[C\]How|sweet\[/)
    expect(draft.chordpro).toContain('How sweet the sound of it')
    expect(draft.stats.unpairedChordLines).toBe(1)
    expect(draft.warnings.map((w) => w.code)).toContain('two_column')
  })

  it('keeps a verse that straddles the gutter in one section', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Song', fontSize: 18 }], { column: null }),
          lines(['Verse 1', 'the first line of the verse', 'the second line of the verse'], { column: 0, y0: 60 }),
          // The continuation carries no heading, so it must not open a section.
          lines(['the third line of the verse', 'the fourth line of the verse'], { column: 1, x0: RIGHT, y0: 60 }),
        ],
        [page(0, { columnCount: 2 })],
      ),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[0].lines).toHaveLength(4)
  })

  it('names the gutter as a place a section break may have been lost', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Song', fontSize: 18 }], { column: null }),
          lines(['Verse 1', 'the first line of the verse'], { column: 0, y0: 60 }),
          lines(['the continuation of the verse'], { column: 1, x0: RIGHT, y0: 60 }),
        ],
        [page(0, { columnCount: 2 })],
      ),
    )
    const boundary = draft.warnings.find((w) => w.code === 'boundary_break')
    expect(boundary.message).toMatch(/second column of page 1/)
  })
})

describe('multi-page', () => {
  const twoPages = (secondPageOverrides = {}) =>
    compose(
      [
        lines([{ text: 'Long Song', fontSize: 18 }, '(Key of D)', '', 'Verse 1', 'the first verse line here', 'the second verse line here'], {
          page: 0,
        }),
        lines(['Verse 3', 'the third verse line here', 'the fourth verse line here'], { page: 1, ...secondPageOverrides }),
      ],
      [page(0), page(1)],
    )

  it('orders pages ascending and does not renumber a continuation section', () => {
    const draft = buildSongDraft(twoPages())
    expect(labels(draft)).toEqual(['Verse 1', 'Verse 3'])
  })

  it('does not take page 2\'s first line as the title', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Long Song', fontSize: 18 }, '', 'Verse 1', 'the first verse line here'], { page: 0 }),
          lines([{ text: 'Not The Title', fontSize: 18 }, 'the second verse line here'], { page: 1 }),
        ],
        [page(0), page(1)],
      ),
    )
    expect(draft.title).toBe('Long Song')
    expect(draft.chordpro).toContain('Not The Title')
  })

  it('keeps a chorus continuing onto page 2 in one section', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Song', fontSize: 18 }, '', 'Chorus', 'the first chorus line here', 'the second chorus line here'], { page: 0 }),
          lines(['the third chorus line here', 'the fourth chorus line here'], { page: 1 }),
        ],
        [page(0), page(1)],
      ),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    expect(sections).toHaveLength(1)
    expect(sections[0].label).toBe('Chorus')
    expect(sections[0].lines).toHaveLength(4)
  })

  it('names the page break as a place a section break may have been lost', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Song', fontSize: 18 }, '', 'Verse 1', 'the first verse line here'], { page: 0 }),
          lines(['the continuation line here'], { page: 1 }),
        ],
        [page(0), page(1)],
      ),
    )
    const boundary = draft.warnings.find((w) => w.code === 'boundary_break')
    expect(boundary.message).toMatch(/top of page 2/)
  })

  it('infers stanza spacing per page, so a resized continuation page still works', () => {
    // Page 2 is typeset at 3/4 scale: a document-wide leading would read its
    // ordinary line pitch as a stanza break and split every line into a section.
    const small = 10.5
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Song', fontSize: 18 }, '', 'Verse 1', 'first line of the verse', 'second line of the verse', 'third line of the verse'], {
            page: 0,
          }),
          lines(
            [
              { text: 'Verse 2', dy: small },
              { text: 'first line of verse two', dy: small },
              { text: 'second line of verse two', dy: small },
              { text: 'third line of verse two', dy: small },
            ],
            { page: 1 },
          ),
        ],
        [page(0), page(1)],
      ),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    expect(sections.map((s) => s.label)).toEqual(['Verse 1', 'Verse 2'])
    expect(sections[1].lines).toHaveLength(3)
  })
})

describe('two-column AND two-page', () => {
  it('reads all four blocks in order', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Big Song', fontSize: 18 }, '(Key of A)'], { page: 0, column: null }),
          lines(['Verse 1', 'the first verse line here'], { page: 0, column: 0, y0: 60 }),
          lines(['Chorus', 'the chorus line goes here'], { page: 0, column: 1, x0: RIGHT, y0: 60 }),
          lines(['Verse 2', 'the second verse line here'], { page: 1, column: 0 }),
          lines(['Bridge', 'the bridge line goes here'], { page: 1, column: 1, x0: RIGHT }),
        ],
        [page(0, { columnCount: 2 }), page(1, { columnCount: 2 })],
      ),
    )
    expect(draft.title).toBe('Big Song')
    expect(draft.key).toBe('A')
    expect(labels(draft)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Bridge'])
  })
})

describe('a page whose layout the extractor could not read', () => {
  it('keeps its chords on their own lines and says so', () => {
    const draft = buildSongDraft(
      compose(
        [
          lines([{ text: 'Song', fontSize: 18 }, '', 'Verse 1', 'G       C', 'Amazing grace how sweet'], { page: 0 }),
          lines(['Verse 2', 'D       A', 'that saved a wretch like'], { page: 1 }),
        ],
        [page(0, { layoutTrusted: false }), page(1)],
        ['page 1: three candidate gutters — layout not understood'],
      ),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    // Page 1 refused to pair; page 2 paired normally.
    expect(sections[0].lines.find((l) => l.chords.length).lyrics.trim()).toBe('')
    expect(sections[1].lines[0].lyrics).toBe('that saved a wretch like')
    expect(sections[1].lines[0].chords.map((c) => c.sym)).toEqual(['D', 'A'])

    const codes = draft.warnings.map((w) => w.code)
    expect(codes).toContain('layout_untrusted')
    expect(codes).toContain('extractor')
  })
})
