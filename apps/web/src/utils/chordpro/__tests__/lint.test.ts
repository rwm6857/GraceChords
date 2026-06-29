import { describe, it, expect } from 'vitest'
import { lintChordPro } from '../lint'

describe('lintChordPro', () => {
  it('reports missing title/key and long lines', () => {
    const s = `{start_of_verse}\n[A]` + 'x'.repeat(120) + `\n{end_of_verse}\n`
    const out = lintChordPro(s)
    const codes = out.map(w => w.code)
    expect(codes).toContain('warn:missing_title')
    expect(codes).toContain('warn:missing_key')
    expect(codes).toContain('warn:long_line')
  })

  it('flags suspicious chords', () => {
    const s = `{start_of_verse}\n[H]Bad chord\n{end_of_verse}`
    const out = lintChordPro(s)
    expect(out.some(w => w.code === 'warn:unknown_chord')).toBe(true)
  })

  it('warns on empty sections', () => {
    const s = `{start_of_chorus}\n{end_of_chorus}`
    const out = lintChordPro(s)
    expect(out.some(w => w.code === 'warn:empty_section')).toBe(true)
  })
})
