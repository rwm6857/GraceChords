import { describe, it, expect } from 'vitest';
import { chooseBestPlan } from '../pdfLayout';

describe('Planner fallback', () => {
  it('falls back to multipage at 12pt when nothing fits', () => {
    const measured = [
      { id: 1, height: 500 },
      { id: 2, height: 500 },
      { id: 3, height: 500 },
    ];
    const res = chooseBestPlan({ measuredSections: measured, pageContentHeight: 400 });
    expect(res.multipage).toBe(true);
    expect(res.pt).toBe(12);
  });
});
