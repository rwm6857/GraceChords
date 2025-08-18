import { describe, it, expect } from 'vitest';
import { parseChordProOrLegacy } from '../parser';
import { serializeChordPro } from '../serialize';
import type { SongDoc } from '../types';

describe('ChordPro serializer', () => {
  const sample = `
Verse 1
[C]Line one
[G]Line two

Chorus
[F]Hook a
[C]Hook b
`;

  it('serializes to directives and round-trips back identically (sections/lines/chords)', () => {
    const doc = parseChordProOrLegacy(sample);
    doc.meta = {
      title: 'Sample Song',
      key: 'C',
      meta: { country: 'USA', tags: 'hymn, slow', youtube: 'abc123' }
    };

    const out = serializeChordPro(doc, { useDirectives: true });
    expect(out).toMatch(/\{title: Sample Song\}/);
    expect(out).toMatch(/\{key: C\}/);
    expect(out).toMatch(/\{meta: country USA\}/);
    expect(out).toMatch(/\{start_of_verse: Verse 1\}/);
    expect(out).toMatch(/\{end_of_chorus\}/);

    const doc2 = parseChordProOrLegacy(out);
    expect(doc2.sections.length).toBe(doc.sections.length);
    for (let i=0;i<doc.sections.length;i++){
      const a = doc.sections[i], b = doc2.sections[i];
      expect(b.label).toBe(a.label);
      expect(b.lines.length).toBe(a.lines.length);
      for (let j=0;j<a.lines.length;j++){
        expect(b.lines[j].lyrics).toBe(a.lines[j].lyrics);
        expect((b.lines[j].chords||[]).length).toBe((a.lines[j].chords||[]).length);
      }
    }
    expect(doc2.meta.meta?.country).toBe('USA');
    expect(doc2.meta.meta?.youtube).toBe('abc123');
  });

  it('preserves directive labels on re-parse', () => {
    const doc: SongDoc = {
      meta: {},
      sections: [
        { kind: 'verse', label: 'Verse 2', lines: [{ lyrics: 'hi', chords: [] }] }
      ]
    };
    const out = serializeChordPro(doc);
    expect(out).toMatch(/\{start_of_verse: Verse 2\}/);
    const doc2 = parseChordProOrLegacy(out);
    expect(doc2.sections[0].label).toBe('Verse 2');
  });

  it('handles chord collisions at same index', () => {
    const doc: SongDoc = {
      meta: {},
      sections: [
        { kind: 'verse', label: 'Verse', lines: [
          { lyrics: '', chords: [
            { sym: 'G', index: 0 },
            { sym: 'C', index: 0 },
            { sym: 'D', index: 0 }
          ] }
        ] }
      ]
    };
    const out = serializeChordPro(doc);
    expect(out).toMatch(/\[G\]\[C\]\[D\]/);
    const doc2 = parseChordProOrLegacy(out);
    const line = doc2.sections[0].lines[0];
    expect(line.chords.map(c => c.sym)).toEqual(['G','C','D']);
  });

  it('can emit legacy header style if directives disabled', () => {
    const doc = parseChordProOrLegacy(sample);
    const out = serializeChordPro(doc, { useDirectives: false, includeMeta: false });
    expect(out).toMatch(/^Verse 1/m);
    expect(out).not.toMatch(/\{start_of_/);
  });
});
