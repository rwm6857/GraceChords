import { describe, it, expect } from 'vitest';
import { parseChordProOrLegacy } from '../parser';

describe('ChordPro sections — long form + shorthands + legacy', () => {
  it('parses long-form start/end with labels', () => {
    const s = `
{start_of_verse: Verse 1}
[A]Line 1
{end_of_verse}
{start_of_chorus}
[B]Hook
{end_of_chorus}
`;
    const doc = parseChordProOrLegacy(s);
    expect(doc.sections.length).toBe(2);
    expect(doc.sections[0].kind).toBe('verse');
    expect(doc.sections[0].label).toMatch(/Verse 1/i);
    expect(doc.sections[1].kind).toBe('chorus');
    expect(doc.sections[1].label).toMatch(/Chorus/i);
  });

  it('parses shorthand {soc}/{eoc}, {sov}/{eov}, {sob}/{eob}', () => {
    const s = `
{soc}
[C]Chorus line
{eoc}
{sov}
[D]Verse line
{eov}
{sob}
[E]Bridge line
{eob}
`;
    const doc = parseChordProOrLegacy(s);
    expect(doc.sections.map(s => s.kind)).toEqual(['chorus','verse','bridge']);
  });

  it('falls back to legacy plain headers when no directives exist', () => {
    const s = `
Verse 2
[A]one
Chorus
[B]two
`;
    const doc = parseChordProOrLegacy(s);
    expect(doc.sections.length).toBe(2);
    expect(doc.sections[0].label).toMatch(/Verse 2/i);
    expect(doc.sections[1].label).toMatch(/Chorus/i);
  });

  it('ignores stray end tags safely and auto-closes last section', () => {
    const s = `
{eoc}
{sov}
[A]text
`;
    const doc = parseChordProOrLegacy(s);
    expect(doc.sections.length).toBe(1);
    expect(doc.sections[0].kind).toBe('verse');
    expect(doc.sections[0].lines.length).toBeGreaterThan(0);
  });
});
