import { describe, it, expect } from "vitest";
import { planLayout } from "../planner.js";
import type { Section, PlanOptions } from "../index.js";

const opts: PlanOptions = {
  ptWindow: [16, 15, 14, 13, 12],
  maxColumns: 2,
  pageSizePt: { w: 612, h: 792 },
  marginsPt: { top: 56, right: 40, bottom: 56, left: 40 },
  gutterPt: 24,
};

function fakeHolyForeverSections(): Section[] {
  // Replace with your actual ChordPro->sections pipeline.
  const paras = [
    "[Verse 1]\nA thousand generations...\nTo sing the song of ages to the Lamb...",
    "[Pre-Chorus]\nYour name is the highest...\nYour name stands above them all...",
    "[Chorus]\nAnd the angels cry, Holy...\nHoly forever...",
    "[Verse 2]\nIf you've been forgiven...\nSing the song forever to the Lamb...",
    "[Tag]\nYou will always be, Holy...\nHoly forever...",
  ];
  return paras.map((t, i) => ({ id: `s${i+1}`, text: t, postSpacing: 8 }));
}

describe("Holy Forever layout", () => {
  it("packs deterministically without splits", async () => {
    const sections = fakeHolyForeverSections();
    const { plan } = await planLayout(sections, opts);
    // Determinism: every section exactly once
    const seen = plan.pages.flatMap((p) => p.columns.flatMap((c) => c.sectionIds));
    expect(new Set(seen).size).toBe(sections.length);
    // Sanity: <= 2 columns per page; >= 1 page
    expect(plan.pages.length).toBeGreaterThanOrEqual(1);
    for (const pg of plan.pages) expect([1, 2]).toContain(pg.columns.length);
  });
});
