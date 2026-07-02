// Glue test for the /api/export/song render pipeline: raw song row →
// toRenderableSong (parse + transpose) → renderSingleSongPdfBuffer bytes.
// The Pages Function itself needs the Workers runtime (WASM import, env);
// this covers the pure pieces it composes.

import { describe, it, expect } from 'vitest'
import { toRenderableSong } from '../utils/pdf_mvp/serverSong.js'
import { renderSingleSongPdfBuffer } from '../utils/pdf_mvp/pure.js'

const SONG_ROW = {
  id: '00000000-0000-0000-0000-000000000001',
  slug: 'above-all',
  title: 'Above All',
  artist: 'Test Artist',
  default_key: 'G',
  chordpro_content: [
    '{title: Above All}',
    '{key: G}',
    '',
    'Verse 1',
    '[G]Above all powers, [C]above all kings,',
    '[G/B]Above all nature [D]and all created things.',
    '',
    'Chorus',
    '{instrumental: G C D x2}',
  ].join('\n'),
}

describe('export song render glue', () => {
  it('toRenderableSong keeps native key when no target key is given', () => {
    const r = toRenderableSong(SONG_ROW, '')
    expect(r.title).toBe('Above All')
    expect(r.key).toBe('G')
    expect(r.originalKey).toBe('G')
    const firstChords = r.sections.flatMap(s => s.lines).flatMap(l => l.chords).map(c => c.sym)
    expect(firstChords).toContain('G')
    expect(firstChords).toContain('C')
  })

  it('toRenderableSong transposes chords, slash chords and instrumentals G→A', () => {
    const r = toRenderableSong(SONG_ROW, 'A')
    expect(r.key).toBe('A')
    expect(r.originalKey).toBe('G')
    const syms = r.sections.flatMap(s => s.lines).flatMap(l => l.chords).map(c => c.sym)
    expect(syms).toContain('A')       // G → A
    expect(syms).toContain('D')       // C → D
    expect(syms).toContain('A/C#')    // G/B → A/C#
    const instr = r.sections.flatMap(s => s.lines).map(l => l.instrumental).filter(Boolean)
    expect(instr.length).toBeGreaterThan(0)
    expect(instr[0].chords).toEqual(['A', 'D', 'E'])
    expect(instr[0].repeat).toBe(2)
  })

  it('renderSingleSongPdfBuffer produces PDF bytes from the renderable', async () => {
    const r = toRenderableSong(SONG_ROW, 'A')
    const buf = await renderSingleSongPdfBuffer(r, {})
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.length).toBeGreaterThan(500)
    const head = String.fromCharCode(...buf.subarray(0, 5))
    expect(head).toBe('%PDF-')
  })
})
