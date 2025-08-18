import { describe, it, expect } from 'vitest';
import { parseChordProOrLegacy } from '../parser';
import { serializeChordPro } from '../serialize';

const s = `
{title: Jolene}
{key: Am}
{capo: 3}
{columns: 2}
{define: G 320003 23xxxx}

{start_of_verse: Verse 1}
{c: Pick soft}
[Am]Jolene...
{end_of_verse}
{column_break}
{start_of_chorus}
[C]Jolene...
{end_of_chorus}
`;

describe('ChordPro features: capo, comments, columns, define', () => {
  it('parses features and re-serializes them', () => {
    const doc = parseChordProOrLegacy(s);
    expect(doc.meta.capo).toBe(3);
    expect(doc.layoutHints?.requestedColumns).toBe(2);
    expect(doc.chordDefs?.length).toBeGreaterThan(0);
    const out = serializeChordPro(doc);
    expect(out).toMatch(/\{capo:\s*3\}/);
    expect(out).toMatch(/\{columns:\s*2\}/);
    expect(out).toMatch(/\{c:\s*Pick soft\}/i);
    expect(out).toMatch(/\{define:\s*G\s+/i);
    expect(out).toMatch(/\{column_break\}/);
  });
});
