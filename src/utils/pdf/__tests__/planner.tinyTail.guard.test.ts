import { describe, it, expect } from 'vitest';
import { chooseBestPlan } from '../pdfLayout';

describe('Planner tiny tail guard', () => {
  it('prefers 1 column when second column would be tiny', () => {
    const measured = [
      { id: 1, height: 150 },
      { id: 2, height: 150 },
      { id: 3, height: 50 },
    ];
    const res = chooseBestPlan({ measuredSections: measured, pageContentHeight: 400 });
    expect(res.multipage).toBeFalsy();
    expect(res.cols).toBe(1);
    expect(res.pt).toBeGreaterThanOrEqual(12);
  });
});
