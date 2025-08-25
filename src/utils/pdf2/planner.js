// Part of the pdf2 engine which currently co-exists with the legacy
// renderer. This module decides layout by measuring and packing sections.
import { measureSection } from "./measure.js";
import { packColumns } from "./packer.js";
import { pushTrace, flushTrace } from "./telemetry.js";

/**
 * Generate a layout plan for the provided sections.
 *
 * Planning is done by repeatedly measuring sections at different font sizes and
 * attempting to greedily pack them (without splitting) into columns/pages. The
 * first combination that fits becomes the final plan. If no size fits, we
 * fall back to a forced multi-page layout at the smallest allowed font.
 *
 * @param {Array<object>} sections - Sections to lay out.
 * @param {object} opts - Planner options including ptWindow and maxColumns.
 * @returns {Promise<{plan: object, fontPt: number}>}
 *   Layout plan with chosen font size.
 */
export async function planLayout(sections, opts) {
  const traces = [];
  const colCandidates = opts.maxColumns === 2 ? [2, 1] : [1];

  for (const pt of opts.ptWindow) {
    const measured = await Promise.all(sections.map((s) => measureSection(s, pt, opts)));
    for (const columns of colCandidates) {
      const pack = packColumns(measured, { ...opts, columns });
      pushTrace(traces, { pt, columns, ok: !!pack });
      if (pack) {
        const plan = { pages: pack.pages, fontPt: pt, telemetry: traces };
        flushTrace("[pdf2] plan OK", traces);
        return { plan, fontPt: pt };
      }
    }
  }

  // Fallback at smallest pt
  const pt = opts.ptWindow[opts.ptWindow.length - 1];
  const measured = await Promise.all(sections.map((s) => measureSection(s, pt, opts)));
  const pack = packColumns(measured, { ...opts, columns: 1, forceMultiPage: true });
  const plan = { pages: pack.pages, fontPt: pt, telemetry: traces };
  flushTrace("[pdf2] fallback", traces);
  return { plan, fontPt: pt };
}
