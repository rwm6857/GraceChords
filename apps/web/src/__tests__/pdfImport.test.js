import { describe, it, expect } from 'vitest'
import {
  alignChordLineToLyrics,
  alignChordWordsToLyrics,
  bodyLeading,
  buildSongDraft,
  classifyLine,
  extractHeader,
  headingToDirective,
  isChordToken,
  isPageFurniture,
  normalizeChordToken,
  parseChordProOrLegacy,
} from '@gracechords/core'
import { doc, lines, page, CW, LEADING } from './fixtures/positionedText.js'

describe('chord tokens', () => {
  it('accepts the shapes a chart actually uses', () => {
    for (const token of ['A', 'G', 'Bb', 'F#', 'Am', 'Cmaj7', 'Dsus4', 'G/B', 'Ebm7', 'N.C.']) {
      expect(isChordToken(token), token).toBe(true)
    }
  })

  it('rejects lyric words that start with a note letter', () => {
    for (const token of ['Amazing', 'grace', 'and', 'be', 'add', 'Come', 'Father']) {
      expect(isChordToken(token), token).toBe(false)
    }
  })

  it('normalizes unicode accidentals and casing', () => {
    expect(normalizeChordToken('b♭')).toBe('Bb')
    expect(normalizeChordToken('f♯MIN7')).toBe('F#min7')
    expect(normalizeChordToken('d/f♯')).toBe('D/F#')
  })
})

describe('classifyLine', () => {
  it('separates chord lines from lyrics', () => {
    expect(classifyLine('G          C        D')).toBe('chords')
    expect(classifyLine('Amazing grace how sweet the sound')).toBe('lyrics')
    expect(classifyLine('')).toBe('blank')
    expect(classifyLine('Verse 1')).toBe('heading')
    expect(classifyLine('CHORUS:')).toBe('heading')
  })

  it('tolerates bars, rhythm slashes and repeat marks', () => {
    expect(classifyLine('| G  / / / | C  / / / |')).toBe('chords')
    expect(classifyLine('G  C  x2')).toBe('chords')
    expect(classifyLine('/ / / /')).toBe('chords')
  })

  it('uses the typographic signal on a marginal line', () => {
    // Two chords and two wordish tokens is a 0.5 ratio — below the token-only bar.
    const text = 'G  C  hold  here'
    expect(classifyLine(text)).toBe('lyrics')
    expect(classifyLine(text, { isBold: true })).toBe('chords')
    expect(classifyLine(text, { fontSize: 8, pageFontSize: 10 })).toBe('chords')
  })
})

describe('headingToDirective', () => {
  it('emits long-form directives only, since the parser drops {soi}/{sot}/{soo}', () => {
    expect(headingToDirective('Intro')).toEqual({ directive: 'intro', label: 'Intro' })
    expect(headingToDirective('Tag')).toEqual({ directive: 'tag', label: 'Tag' })
    expect(headingToDirective('Outro')).toEqual({ directive: 'outro', label: 'Outro' })
    expect(headingToDirective('Verse 2')).toEqual({ directive: 'verse', label: 'Verse 2' })
  })

  it('maps Pre-Chorus and Interlude to named choruses, as core does', () => {
    expect(headingToDirective('Pre-Chorus')).toEqual({ directive: 'chorus', label: 'Pre-Chorus' })
    expect(headingToDirective('PRE CHORUS')).toEqual({ directive: 'chorus', label: 'Pre-Chorus' })
    expect(headingToDirective('Interlude')).toEqual({ directive: 'chorus', label: 'Interlude' })
    expect(headingToDirective('Refrain')).toEqual({ directive: 'chorus', label: 'Chorus' })
  })

  // Found by importing a PDF the app itself exported: its section labels are drawn
  // bracketed and upper-case, so every heading came through as a lyric line.
  it('accepts bracketed and parenthesised headings, which is what charts actually use', () => {
    expect(headingToDirective('[VERSE 1]')).toEqual({ directive: 'verse', label: 'Verse 1' })
    expect(headingToDirective('[CHORUS]')).toEqual({ directive: 'chorus', label: 'Chorus' })
    expect(headingToDirective('[PRE-CHORUS]')).toEqual({ directive: 'chorus', label: 'Pre-Chorus' })
    expect(headingToDirective('(Bridge)')).toEqual({ directive: 'bridge', label: 'Bridge' })
    expect(headingToDirective('Chorus:')).toEqual({ directive: 'chorus', label: 'Chorus' })
    expect(classifyLine('[VERSE 1]')).toBe('heading')
  })

  it('does not mistake a chord for a heading', () => {
    for (const text of ['[G]', '[Am7]', 'G       C', '[D]Short [G]lines [A]fit']) {
      expect(headingToDirective(text), text).toBeNull()
    }
  })

  it('every directive it emits survives the parser', () => {
    for (const heading of ['Verse 1', 'Chorus', 'Bridge', 'Intro', 'Outro', 'Tag', 'Pre-Chorus', 'Interlude']) {
      const d = headingToDirective(heading)
      const parsed = parseChordProOrLegacy(`{start_of_${d.directive}: ${d.label}}\nla\n{end_of_${d.directive}}`)
      expect(parsed.sections, heading).toHaveLength(1)
      expect(parsed.sections[0].label, heading).toBe(d.label)
    }
  })
})

describe('alignment', () => {
  const align = (chordRow, lyricRow, opts) => {
    const [chords, lyrics] = lines([chordRow, lyricRow], opts)
    return alignChordWordsToLyrics(chords, lyrics)
  }

  it('places each chord at the word beneath it', () => {
    //          Amazing=0  grace=8   sweet=18
    const r = align(
      'G       C         D',
      'Amazing grace how sweet the sound',
    )
    expect(r.line).toBe('[G]Amazing [C]grace how [D]sweet the sound')
    expect(r.inserted).toBe(3)
    expect(r.suspiciousInsertions).toBe(0)
  })

  it('places a chord written over the middle of a word inside that word', () => {
    // The chord is at column 11, which is the 4th character of "grace" (8-12).
    const r = align(
      'G          C',
      'Amazing grace how sweet',
    )
    expect(r.line).toBe('[G]Amazing gra[C]ce how sweet')
  })

  it('goes mid-word when the chord sits inside a long word', () => {
    const r = align(
      '   G',
      'Amazing grace',
    )
    expect(r.line).toBe('Ama[G]zing grace')
    expect(r.suspiciousInsertions).toBe(0)
  })

  it('puts a chord over a short word at its start, and does not call that suspicious', () => {
    // "how" has no runway: 3 characters cannot be 2 from each edge, so the start is
    // the only sane position. Counting it as a compromise made a good real import
    // report 53 suspicious placements out of 99 chords.
    const short = align('  G', 'how sweet')
    expect(short.line).toBe('[G]how sweet')
    expect(short.suspiciousInsertions).toBe(0)
  })

  it('counts a fallback as suspicious only when the word could have taken the chord', () => {
    // "Amazing" is long enough for a mid-word chord, so failing to measure it is a
    // real loss of precision and is reported.
    const long = align('   G', 'Amazing grace', { charX: false })
    expect(long.line).toBe('[G]Amazing grace')
    expect(long.suspiciousInsertions).toBe(1)
  })

  it('refuses to split at a hyphen', () => {
    // Column 6 is the hyphen in "wonder-ful".
    const r = align(
      '      G',
      'wonder-ful grace',
    )
    expect(r.line).toBe('[G]wonder-ful grace')
    expect(r.suspiciousInsertions).toBe(1)
  })

  it('snaps to the word start when the extractor supplied no character metrics', () => {
    const r = align('   G', 'Amazing grace', { charX: false })
    expect(r.line).toBe('[G]Amazing grace')
    expect(r.suspiciousInsertions).toBe(1)
  })

  it('keeps chord order monotonic and never stacks two chords at one offset', () => {
    // Both chords land nearest the same short word; the second must advance.
    const r = align(
      'G C',
      'the sound of grace',
    )
    expect(r.line.match(/\[/g)).toHaveLength(2)
    expect(r.line).not.toMatch(/\]\[/)
    const first = r.line.indexOf('[G]')
    const second = r.line.indexOf('[C]')
    expect(first).toBeLessThan(second)
  })

  // Found on a real chart: a 7-chord instrumental run sat above a 5-character line,
  // and forcing the pair piled four of the seven chords onto its last character.
  it('refuses to pair a chord line far denser than the lyrics beneath it', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Intro',
        'A  E  Bsus  C#m  B  E/G#  C#m7',
        'sound',
      ]),
    )
    const line = parseChordProOrLegacy(draft.chordpro).sections[0].lines.find((l) => l.chords.length)
    // Kept as a chord-only line, so every chord has its own position.
    expect(line.lyrics.trim()).toBe('')
    expect(new Set(line.chords.map((c) => c.index)).size).toBe(line.chords.length)
    expect(draft.stats.unpairedChordLines).toBe(1)
  })

  it('never places two chords at the same position inside a line', () => {
    const r = align(
      'G       C         D',
      'Amazing grace how sweet the sound',
    )
    const doc2 = parseChordProOrLegacy(r.line)
    const indices = doc2.sections[0].lines[0].chords.map((c) => c.index)
    const interior = indices.filter((i) => i < doc2.sections[0].lines[0].lyrics.length)
    expect(new Set(interior).size).toBe(interior.length)
  })

  it('falls back to proportional placement with no word geometry', () => {
    const r = alignChordLineToLyrics('G          C', 'Amazing grace how sweet')
    expect(r.inserted).toBe(2)
    expect(r.line.startsWith('[G]')).toBe(true)
    expect(r.line).toMatch(/\[C\]/)
  })
})

describe('page furniture and header', () => {
  it('recognises furniture', () => {
    expect(isPageFurniture('www.gracechords.com')).toBe(true)
    expect(isPageFurniture('CCLI Song #1234')).toBe(true)
    expect(isPageFurniture('Page 2 of 3')).toBe(true)
    expect(isPageFurniture('© 2019 Some Publisher')).toBe(true)
    expect(isPageFurniture('Amazing grace how sweet the sound')).toBe(false)
  })

  it('reads title, key and author off the head of page 1', () => {
    const l = lines([
      { text: 'Amazing Grace', fontSize: 18 },
      '(Key of G)',
      'John Newton',
      '',
      'Amazing grace how sweet the sound',
    ])
    const header = extractHeader(l, 10)
    expect(header.title).toBe('Amazing Grace')
    expect(header.key).toBe('G')
    expect(header.artist).toBe('John Newton')
    expect(header.consumed.size).toBe(3)
  })

  it('accepts the unparenthesized key spellings', () => {
    for (const [text, expected] of [
      ['Key of G', 'G'],
      ['Key: Bb', 'Bb'],
      ['Key - F#', 'F#'],
      ['(Key of Am)', 'Am'],
      ['(Key of E minor)', 'Em'],
    ]) {
      const header = extractHeader(lines([{ text: 'Song', fontSize: 18 }, text]), 10)
      expect(header.key, text).toBe(expected)
    }
  })
})

describe('vertical rhythm', () => {
  it('reads the body leading from the wide pairs, not the tight chord/lyric ones', () => {
    // Chord lines sit 8pt above their lyrics; lyric-to-next-chord is a full 14pt.
    const l = lines([
      { text: 'G', dy: 8 },
      'first line here',
      { text: 'C', dy: 8 },
      'second line here',
      { text: 'D', dy: 8 },
      'third line here',
      { text: 'G', dy: 8 },
      'fourth line here',
      { text: 'C', dy: 8 },
      'fifth line here',
    ])
    const items = l.map((line) => ({ line, kind: classifyLine(line.text) }))
    // The tight 8pt pitches are the majority, so a mode over ALL pitches would
    // return 8. Excluding chord-led pairs leaves only the body's own 14pt rhythm.
    expect(bodyLeading(items)).toBeCloseTo(LEADING, 5)
  })
})

describe('buildSongDraft', () => {
  const amazingGrace = () =>
    doc([
      { text: 'Amazing Grace', fontSize: 18 },
      '(Key of G)',
      '',
      'Verse 1',
      'G          C        D',
      'Amazing grace how sweet the sound',
      '',
      'Chorus',
      'G        D',
      'How sweet the sound',
    ])

  it('produces a body the parser reads back as the sections it wrote', () => {
    const draft = buildSongDraft(amazingGrace())
    expect(draft.title).toBe('Amazing Grace')
    expect(draft.key).toBe('G')
    expect(draft.chordpro).toContain('{start_of_verse: Verse 1}')
    expect(draft.chordpro).toContain('{start_of_chorus: Chorus}')

    const parsed = parseChordProOrLegacy(draft.chordpro)
    expect(parsed.sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus'])
    expect(parsed.sections[0].lines[0].chords.map((c) => c.sym)).toEqual(['G', 'C', 'D'])
    expect(parsed.sections[0].lines[0].lyrics).toBe('Amazing grace how sweet the sound')
  })

  it('never emits {title} or {key} into the body — those are form columns', () => {
    const draft = buildSongDraft(amazingGrace())
    expect(draft.chordpro).not.toMatch(/\{title/i)
    expect(draft.chordpro).not.toMatch(/\{key/i)
  })

  it('strips furniture from the body', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Amazing Grace', fontSize: 18 },
        '',
        'Verse 1',
        'Amazing grace how sweet the sound',
        '',
        'CCLI Song #22025',
        'www.example.org',
      ]),
    )
    expect(draft.chordpro).not.toMatch(/CCLI/)
    expect(draft.chordpro).not.toMatch(/example\.org/)
  })

  it('keeps a chord line with no lyrics under it inside its own section, spacing intact', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Riff Song', fontSize: 18 },
        '',
        'Intro',
        'G  C  D',
        '',
        'Verse 1',
        'Amazing grace how sweet the sound',
      ]),
    )
    expect(draft.chordpro).toContain('[G]   [C]   [D]')
    expect(draft.stats.unpairedChordLines).toBe(1)

    // {instrumental: ...} would have been ejected from the Intro by the parser,
    // which treats it as a standalone section.
    const parsed = parseChordProOrLegacy(draft.chordpro)
    const intro = parsed.sections.find((s) => s.label === 'Intro')
    expect(intro.lines).toHaveLength(1)
    expect(intro.lines[0].chords.map((c) => c.sym)).toEqual(['G', 'C', 'D'])
    expect(intro.lines[0].chords.map((c) => c.index)).toEqual([0, 3, 6])
  })

  // Real charts space their stanzas generously. Splitting a section at every gap
  // turned one eight-line verse into three sections and invented labels ("Verse 4",
  // "Verse 7") that appear nowhere on the page, so once a heading has been seen only
  // a heading starts a section — a gap inside one becomes a blank line.
  it('keeps a gap inside a section as a blank line, not a new section', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Verse 2',
        'the second verse line',
        '',
        'a further line of the same verse',
      ]),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    expect(sections.map((s) => s.label)).toEqual(['Verse 2'])
    expect(sections[0].lines.map((l) => l.lyrics)).toEqual([
      'the second verse line',
      '',
      'a further line of the same verse',
    ])
  })

  it('auto-labels content that appears before any heading', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'an orphan line before any heading',
        '',
        'Verse 2',
        'the second verse line',
      ]),
    )
    expect(parseChordProOrLegacy(draft.chordpro).sections.map((s) => s.label)).toEqual([
      'Verse 1',
      'Verse 2',
    ])
  })

  it('wraps nothing and warns when the chart has no headings', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Amazing grace how sweet the sound',
        'that saved a wretch like me',
        '',
        'I once was lost but now am found',
        'was blind but now I see',
      ]),
    )
    expect(draft.chordpro).not.toMatch(/start_of_/)
    expect(draft.chordpro).toBe(
      'Amazing grace how sweet the sound\nthat saved a wretch like me\n\n' +
        'I once was lost but now am found\nwas blind but now I see',
    )
    expect(draft.warnings.map((w) => w.code)).toContain('no_sections')
    expect(draft.stats.sections).toBe(0)
  })

  it('preserves stanza spacing from the vertical gaps', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Verse 1',
        'line one of the verse',
        'line two of the verse',
        '',
        'line one of the next stanza',
      ]),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    expect(sections).toHaveLength(1)
    // The gap survives as a blank line inside the section rather than splitting it.
    expect(sections[0].lines.map((l) => l.lyrics)).toEqual([
      'line one of the verse',
      'line two of the verse',
      '',
      'line one of the next stanza',
    ])
  })

  // Found by importing a real PDF: charts set a heading with extra space beneath it,
  // and reading that space as a stanza break orphaned every section — the heading's
  // block stayed empty and was dropped, and its lyrics became an auto-numbered verse.
  it('keeps a section attached to its heading across the space beneath it', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Verse 1',
        '',
        'the first line of the verse',
        'the second line of the verse',
        '',
        'Chorus',
        '',
        'the first line of the chorus',
        'the second line of the chorus',
      ]),
    )
    const sections = parseChordProOrLegacy(draft.chordpro).sections
    expect(sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus'])
    expect(sections[0].lines.map((l) => l.lyrics)).toEqual([
      'the first line of the verse',
      'the second line of the verse',
    ])
    expect(sections[1].lines).toHaveLength(2)
  })

  it('strips the footer its own PDF export draws, so a GraceChords chart round-trips', () => {
    const footer = 'All lyrics and music are the property of their respective owners. For personal worship and educational use only.'
    expect(isPageFurniture(footer)).toBe(true)
    const draft = buildSongDraft(
      doc([{ text: 'Song', fontSize: 18 }, '', 'Verse 1', 'the only line of the verse', '', { text: footer, fontSize: 8 }]),
    )
    expect(draft.chordpro).not.toMatch(/respective owners/)
  })

  // All three found by importing real PraiseCharts charts.
  describe('metadata written inline on a details line', () => {
    const detailsLine = (text) =>
      doc([{ text: 'Song', fontSize: 18 }, text, '', 'Verse 1', 'the only line of the verse'])

    it('reads key, tempo and time signature from anywhere in the line', () => {
      const draft = buildSongDraft(detailsLine('Key: E · Tempo: 68 · Time: 4/4'))
      expect(draft.key).toBe('E')
      expect(draft.tempo).toBe('68')
      expect(draft.timeSignature).toBe('4/4')
    })

    it('still reads them when the line also carries a URL it would otherwise discard', () => {
      // The real shape: one line holding both the publisher's URL and every piece of
      // metadata worth having. Stripping it as furniture first threw away the key.
      const draft = buildSongDraft(detailsLine('www.praisecharts.com/70537 Key: A · Capo: 2'))
      expect(draft.key).toBe('A')
      expect(draft.chordpro).not.toMatch(/praisecharts/)
    })

    it('keeps a details line out of the body instead of making it a verse', () => {
      const draft = buildSongDraft(detailsLine('Shane & Shane / The Worship Initiative · Tempo: 78'))
      expect(draft.tempo).toBe('78')
      expect(draft.chordpro).not.toMatch(/Worship Initiative/)
      expect(parseChordProOrLegacy(draft.chordpro).sections.map((s) => s.label)).toEqual(['Verse 1'])
    })

    it('takes a slash-separated credit list as the artist', () => {
      const draft = buildSongDraft(
        doc([
          { text: 'Song', fontSize: 18 },
          'Leeland / Arr. Cliff Duren / Mason Brown',
          '',
          'Verse 1',
          'the only line of the verse',
        ]),
      )
      expect(draft.artist).toBe('Leeland / Arr. Cliff Duren / Mason Brown')
      expect(draft.chordpro).not.toMatch(/Leeland/)
    })
  })

  it('accepts a heading carrying a performance note', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Intro (2x) (Riff)',
        'A / / / | D2 / / /',
        '',
        'Verse 1 (2x)',
        'the only line of the verse',
      ]),
    )
    expect(parseChordProOrLegacy(draft.chordpro).sections.map((s) => s.label)).toEqual([
      'Intro',
      'Verse 1',
    ])
  })

  it('warns about a missing title and key, and scores them down', () => {
    const draft = buildSongDraft(doc(['G   C', 'Amazing grace how sweet']))
    const codes = draft.warnings.map((w) => w.code)
    expect(codes).toContain('no_key')
    expect(draft.confidence).toBeLessThan(100)
  })

  it('relays extractor diagnostics as warnings and docks confidence', () => {
    const base = amazingGrace()
    const clean = buildSongDraft(base)
    const noisy = buildSongDraft({ ...base, diagnostics: ['page 1: character bounds desynced'] })
    expect(noisy.warnings.some((w) => w.code === 'extractor')).toBe(true)
    expect(noisy.confidence).toBeLessThan(clean.confidence)
  })

  it('skips chord pairing on a page whose layout the extractor could not read', () => {
    const base = doc([
      { text: 'Song', fontSize: 18 },
      '',
      'Verse 1',
      'G          C        D',
      'Amazing grace how sweet the sound',
    ])
    const untrusted = { ...base, pages: [page(0, { layoutTrusted: false })] }
    const draft = buildSongDraft(untrusted)
    expect(draft.chordpro).toContain('Amazing grace how sweet the sound')
    expect(draft.chordpro).not.toMatch(/\[G\]Amazing/)
    expect(draft.warnings.map((w) => w.code)).toContain('layout_untrusted')

    // The chord line survives on its own, at the columns it occupied on the page.
    const parsed = parseChordProOrLegacy(draft.chordpro)
    const chordRow = parsed.sections[0].lines.find((l) => l.chords.length)
    expect(chordRow.chords.map((c) => c.sym)).toEqual(['G', 'C', 'D'])
    expect(chordRow.chords.map((c) => c.index)).toEqual([0, 11, 20])
  })

  it('does not pair a chord line across a blank-line gap', () => {
    const draft = buildSongDraft(
      doc([
        { text: 'Song', fontSize: 18 },
        '',
        'Verse 1',
        'G  C',
        '',
        'Amazing grace how sweet the sound',
      ]),
    )
    expect(draft.chordpro).toContain('[G]   [C]')
    expect(draft.chordpro).toContain('Amazing grace how sweet the sound')
    expect(draft.stats.unpairedChordLines).toBe(1)
  })

  it('does not pair a chord line with a lyric line that is horizontally elsewhere', () => {
    const chordLine = lines(['G  C'])[0]
    const lyricLine = lines(['Amazing grace how sweet'], { x0: 400 })[0]
    lyricLine.y = chordLine.y + LEADING
    lyricLine.startsBlock = false
    const draft = buildSongDraft({ lines: [chordLine, lyricLine], pages: [page(0)], diagnostics: [] })
    expect(draft.chordpro).toContain('[G]   [C]')
    expect(draft.chordpro).not.toMatch(/\[G\]Amazing|\[C\]grace/)
    expect(draft.stats.unpairedChordLines).toBe(1)
  })
})

describe('the generated body always parses', () => {
  const fixtures = [
    ['ordinary chart', doc([{ text: 'A Song', fontSize: 18 }, '(Key of D)', '', 'Verse 1', 'D    A', 'words go here now', '', 'Chorus', 'G    D', 'and here they go'])],
    ['no headings', doc([{ text: 'A Song', fontSize: 18 }, '', 'words go here now'])],
    ['chords only', doc([{ text: 'A Song', fontSize: 18 }, '', 'Intro', 'D  A  G'])],
    ['empty', { lines: [], pages: [page(0)], diagnostics: [] }],
    ['furniture only', doc([{ text: 'CCLI #1', fontSize: 10 }])],
  ]

  for (const [name, fixture] of fixtures) {
    it(name, () => {
      const draft = buildSongDraft(fixture)
      expect(() => parseChordProOrLegacy(draft.chordpro)).not.toThrow()
      expect(draft.confidence).toBeGreaterThanOrEqual(0)
      expect(draft.confidence).toBeLessThanOrEqual(100)
    })
  }
})

describe('fixture sanity', () => {
  it('places a chord at the character column it is written at', () => {
    const [chords] = lines(['   G'])
    expect(chords.words[0].x).toBe(3 * CW)
  })
})
