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

  it('creates standalone sections for instrumental and comment directives', () => {
    const src = `
{title: Sample}
{start_of_verse: Verse 1}
Line before
{inst D, A, E}
Line after
{end_of_verse}
{com Whisper}
{i: Em, D, Am7, Bm7 x2}
`;

    const doc = parseChordProOrLegacy(src);
    expect(doc.sections.length).toBeGreaterThanOrEqual(4);

    const [first, second, third, fourth] = doc.sections;
    expect(first.kind).toBe('verse');
    expect(first.lines[0]?.lyrics).toBe('Line before');

    expect(second.kind).toBe('instrumental');
    expect(second.instrumental?.chords).toEqual(['D', 'A', 'E']);
    expect(second.lines[0]?.instrumental?.repeat).toBeUndefined();

    expect(third.kind).toBe('verse');
    expect(third.lines[0]?.lyrics).toBe('Line after');

    const commentSec = doc.sections.find(sec => sec.kind === 'comment');
    expect(commentSec?.lines?.[0]?.comment).toBe('Whisper');

    const instSections = doc.sections.filter(sec => sec.kind === 'instrumental');
    expect(instSections).toHaveLength(2);
    const lastInst = instSections[instSections.length - 1];
    expect(lastInst.instrumental?.chords).toEqual(['Em', 'D', 'Am7', 'Bm7']);
    expect(lastInst.instrumental?.repeat).toBe(2);
  });

  it('keeps top-level instrumental directives ahead of the first section', () => {
    const src = `
{title: Example}
{inst Em, D, Am7, Bm7 x2}
{sov Verse 1}
[Em]Line one
{eov}
`;
    const doc = parseChordProOrLegacy(src);
    expect(doc.sections[0]?.kind).toBe('instrumental');
    const instLine = doc.sections[0]?.lines?.[0];
    expect(instLine?.instrumental?.chords).toEqual(['Em', 'D', 'Am7', 'Bm7']);
    expect(instLine?.instrumental?.repeat).toBe(2);
    expect(doc.sections[1]?.kind).toBe('verse');

    const blocks = (doc.sections || []).map((sec) => ({
      section: sec.label,
      lines: (sec.lines || []).map((ln) => ({
        instrumental: ln.instrumental,
        comment: ln.comment,
      })),
    }));
    expect(blocks[0]?.lines?.[0]?.instrumental?.chords).toEqual(['Em', 'D', 'Am7', 'Bm7']);
  });
});
