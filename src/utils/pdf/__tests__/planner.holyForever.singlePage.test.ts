import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chooseBestPlan } from '../../pdfLayout';

// Tiny helper: parse fixture into sections separated by ChordPro section blocks.
function parseSections(chordpro: string) {
  const lines = chordpro.split(/\r?\n/);
  const sections: { id: number; lines: number }[] = [];
  let current: string[] = [];
  const push = () => {
    if (current.length) {
      sections.push({ id: sections.length + 1, lines: current.length });
      current = [];
    }
  };
  for (const ln of lines) {
    if (/^\{(verse|pre-chorus|chorus|bridge|tag)/i.test(ln)) {
      push();
      continue;
    }
    if (/^\{end_of_/.test(ln)) {
      push();
      continue;
    }
    if (ln.trim() && !/^\{.*\}$/.test(ln)) current.push(ln);
  }
  push();
  return sections;
}

// Height model: line height scales with pt; short lines → minimal wrapping, so height ~ lines * (pt * 1.35)
function measureSectionsForPt(sections: { id:number; lines:number }[], pt: number) {
  const lineHeight = pt * 1.35;
  // add small header spacing per section (7pt); precompute section heights
  return sections.map(({ id, lines }) => ({
    id,
    height: (lines * lineHeight) + 7,
  }));
}

describe('Planner – Holy Forever', () => {
  it('picks single page, 2 columns, max feasible size (12–16 pt window)', () => {
    const fx = fs.readFileSync(path.resolve(__dirname, 'fixtures/holy_forever.chordpro'), 'utf8');
    const secs = parseSections(fx);

    // Page content height: realistic for Letter with margins
    const pageContentHeight = 710; // pts

    // Evaluate from 16→12, passing pt-specific measured heights
    let winner: any = null;
    for (let pt = 16; pt >= 12; pt--) {
      const measured = measureSectionsForPt(secs, pt);
      const res = chooseBestPlan({
        measuredSections: measured,
        pageContentHeight,
        hasColumnsHint: true,
        honorColumnBreaks: true,
      });
      if (!res.multipage && (!winner || res.pt > winner.pt)) {
        winner = res;
      }
    }

    expect(winner).toBeTruthy();
    expect(winner.pt).toBeGreaterThanOrEqual(12);
    expect(winner.pt).toBeLessThanOrEqual(16);
    expect(winner.cols).toBe(2);
    expect(winner.pack.singlePage).toBe(true);

    // No section split: each section id appears in one column only
    const flatPlaced = winner.pack.placed.flat();
    expect(new Set(flatPlaced).size).toBe(flatPlaced.length);

    // Sanity: it’s truly single page
    expect(winner.pack.occupancy.every((o:number) => o <= 1)).toBe(true);
  });
});
