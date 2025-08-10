// src/__tests__/pdf.layout.snapshot.test.js
import { describe, it, expect } from 'vitest'
import { parseChordPro } from '../utils/chordpro.js'
import { getLayoutMetrics } from '../utils/pdf.js'

const CHORDPRO = `
{title: Test Song}
{key: G}
[VERSE]
[G]This is a [D]line with [Em]chords and [C]lyrics that may wrap around to the next line when wide.
[CHORUS]
[C]Short line
[G]Another short line
[BRIDGE]
[Em]A very very very very very very very very very very very very long line to force two columns
`;

describe('PDF layout snapshot', () => {
  it('chord/lyric positions and columns stay stable (G)', () => {
    const parsed = parseChordPro(CHORDPRO)
    const snap = getLayoutMetrics(parsed, { key: 'G', chordsOn: true })
    expect(snap).toMatchSnapshot()
  })

  it('transposed layout stays stable (A)', () => {
    const parsed = parseChordPro(CHORDPRO)
    const snap = getLayoutMetrics(parsed, { key: 'A', chordsOn: true })
    expect(snap).toMatchSnapshot()
  })
})
