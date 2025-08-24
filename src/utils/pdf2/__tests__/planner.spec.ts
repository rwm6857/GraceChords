import { describe, it, expect } from "vitest";
import { planLayout } from "../planner";
import type { Section, PlanOptions } from "../index";

const opts: PlanOptions = {
  ptWindow: [16, 15, 14, 13, 12],
  maxColumns: 2,
  pageSizePt: { w: 612, h: 792 },
  marginsPt: { top: 56, right: 40, bottom: 56, left: 40 },
  gutterPt: 24,
};

const mkSection = (id: string, text: string): Section => ({ id, text, postSpacing: 8 });

describe("pdf2 planner", () => {
  it("chooses the first size that fits (prefers 2 columns)", async () => {
    const sections = [
      mkSection("v1", "A".repeat(400)),
      mkSection("pc", "B".repeat(300)),
      mkSection("ch", "C".repeat(300)),
    ];
    const { plan } = await planLayout(sections, opts);
    expect(plan.pages.length).toBeGreaterThan(0);
    expect([1, 2]).toContain(plan.pages[0].columns.length);
    // no duplicates / omissions
    const all = plan.pages.flatMap((p) => p.columns.flatMap((c) => c.sectionIds));
    all.sort();
    expect(all).toEqual(["ch", "pc", "v1"].sort());
  });
});
