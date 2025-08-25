import { describe, it, expect, vi } from 'vitest';

const baseOpts = {
  ptWindow: [16, 14],
  maxColumns: 2,
  pageSizePt: { w: 612, h: 792 },
  marginsPt: { top: 56, right: 40, bottom: 56, left: 40 },
  gutterPt: 24,
};

const mkSection = (id) => ({ id, text: '', postSpacing: 0 });

async function planWith(sections, heights, opts = baseOpts) {
  vi.resetModules();
  vi.doMock('../measure.js', () => ({
    measureSection: (s, fontPt) => {
      const h = heights[s.id]?.[fontPt];
      return Promise.resolve({ id: s.id, height: h ?? 0, postSpacing: s.postSpacing ?? 0 });
    },
  }));
  const { planLayout } = await import('../planner.js');
  return planLayout(sections, opts);
}

describe('pdf2 planner', () => {
  it('steps down the font-size ladder until layout fits', async () => {
    const sections = [mkSection('a'), mkSection('b')];
    const heights = { a: { 16: 700, 14: 600 }, b: { 16: 100, 14: 80 } };
    const { plan, fontPt } = await planWith(sections, heights, { ...baseOpts, ptWindow: [16, 14] });
    expect(fontPt).toBe(14);
    expect(plan.fontPt).toBe(14);
  });

  it('prefers two columns when both one and two fit', async () => {
    const sections = [mkSection('a'), mkSection('b')];
    const heights = { a: { 16: 100 }, b: { 16: 100 } };
    const { plan } = await planWith(sections, heights, { ...baseOpts, ptWindow: [16] });
    expect(plan.pages[0].columns.length).toBe(2);
  });

  it('never splits sections across columns or pages', async () => {
    const sections = [mkSection('a'), mkSection('b'), mkSection('c')];
    const heights = { a: { 16: 400 }, b: { 16: 400 }, c: { 16: 400 } };
    const { plan } = await planWith(sections, heights, { ...baseOpts, ptWindow: [16] });
    const seen = plan.pages.flatMap(p => p.columns.flatMap(c => c.sectionIds));
    seen.sort();
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('falls back to single-column layout at smallest size when nothing fits', async () => {
    const sections = [mkSection('small'), mkSection('big')];
    const heights = { small: { 16: 100, 14: 100 }, big: { 16: 900, 14: 900 } };
    const { plan, fontPt } = await planWith(sections, heights, { ...baseOpts, ptWindow: [16, 14] });
    expect(fontPt).toBe(14);
    expect(plan.pages[0].columns.length).toBe(1);
    const ids = plan.pages.flatMap(p => p.columns.flatMap(c => c.sectionIds));
    expect(ids).toContain('big');
  });
});

