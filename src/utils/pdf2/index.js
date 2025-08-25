// pdf2 entry (JS). Exposes planner+renderer helpers.
// This experimental engine currently runs alongside the legacy pdf
// generator. The facade at src/utils/pdf/index.js chooses which engine
// to invoke while we transition.

import { planLayout } from "./planner.js";
import { renderSongInto } from "./renderer.js";

/**
 * Determines a layout plan for the given song sections.
 *
 * The planner performs a "no-split" layout pass, meaning sections are never
 * broken across columns or pages. It delegates to {@link planLayout} which
 * iterates through font sizes and column counts until everything fits.
 *
 * @param {Array<object>} sections - Song sections to plan.
 * @param {object} opts - Rendering options.
 * @returns {Promise<{plan: object, fontPt: number}>} Plan and resolved font size.
 */
export async function planSong(sections, opts) {
  const { plan, fontPt } = await planLayout(sections, opts);
  return { plan, fontPt };
}

/**
 * Renders a previously generated layout plan into a jsPDF document.
 *
 * Rendering is kept separate from planning so that the same plan can be drawn
 * multiple times or inspected during debugging.
 *
 * @param {import("jspdf").jsPDF} doc - Target document.
 * @param {string} songTitle - Title shown in the header.
 * @param {Array<object>} sections - Original sections with content.
 * @param {object} plan - Layout plan produced by {@link planSong}.
 * @param {object} opts - Rendering options.
 * @returns {Promise<void>} Resolves when drawing is complete.
 */
export async function renderSongIntoDoc(doc, songTitle, sections, plan, opts) {
  return renderSongInto(doc, songTitle, sections, plan, opts);
}
