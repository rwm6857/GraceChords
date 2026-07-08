import { describe, it, expect } from 'vitest'
import {
  insertAtCursor,
  wrapSection,
  chordInsertToken,
  SECTION_PRESETS,
} from '@gracechords/core'
import { parseChordProOrLegacy } from '@gracechords/core'

describe('insertAtCursor', () => {
  it('inserts at the caret and advances the selection', () => {
    const r = insertAtCursor('AC', { start: 1, end: 1 }, 'B')
    expect(r.value).toBe('ABC')
    expect(r.selection).toEqual({ start: 2, end: 2 })
  })

  it('replaces a selected range', () => {
    const r = insertAtCursor('AXXC', { start: 1, end: 3 }, 'B')
    expect(r.value).toBe('ABC')
    expect(r.selection).toEqual({ start: 2, end: 2 })
  })
})

describe('wrapSection', () => {
  it('wraps a selection in start/end directives', () => {
    const r = wrapSection('hello', { start: 0, end: 5 }, { directive: 'verse', label: 'Verse' })
    expect(r.value).toBe('{start_of_verse: Verse}\nhello\n{end_of_verse}\n')
    expect(r.selection.start).toBe(0)
  })

  it('inserts an empty block with the caret on the content line', () => {
    const r = wrapSection('', { start: 0, end: 0 }, { directive: 'chorus', label: 'Chorus' })
    expect(r.value).toBe('{start_of_chorus: Chorus}\n\n{end_of_chorus}\n')
    // caret sits just after the start directive + newline
    expect(r.selection.start).toBe('{start_of_chorus: Chorus}'.length + 1)
  })
})

describe('SECTION_PRESETS', () => {
  it('only maps to parser-supported directives', () => {
    const allowed = new Set(['verse', 'chorus', 'bridge', 'intro', 'outro', 'tag'])
    for (const p of SECTION_PRESETS) expect(allowed.has(p.directive)).toBe(true)
  })

  it('emits Pre-Chorus as a named chorus that survives the parser', () => {
    const preset = SECTION_PRESETS.find((p) => p.label === 'Pre-Chorus')!
    expect(preset.directive).toBe('chorus')
    const { value } = wrapSection('body', { start: 0, end: 4 }, {
      directive: preset.directive,
      label: preset.sectionLabel,
    })
    const doc = parseChordProOrLegacy(value)
    // The section is NOT dropped — it parses as a chorus labelled "Pre-Chorus".
    expect(doc.sections.length).toBe(1)
    expect(doc.sections[0].kind).toBe('chorus')
  })
})

describe('chordInsertToken', () => {
  it('wraps a symbol in brackets', () => {
    expect(chordInsertToken('G')).toBe('[G]')
    expect(chordInsertToken('Amaj7')).toBe('[Amaj7]')
  })
})
