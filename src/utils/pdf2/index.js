// pdf2 entry (JS). Exposes planner+renderer helpers.
// This experimental engine currently runs alongside the legacy pdf
// generator. The facade at src/utils/pdf/index.js chooses which engine
// to invoke while we transition.

import { planLayout } from "./planner.js";
import { renderSongInto } from "./renderer.js";
import { registerPdfFonts } from "./fonts.js"; // ensure local registrar

/**
 * Try to register Noto fonts with jsPDF.
 * We support either location:
 *  - src/utils/pdf2/fonts.js
 *  - src/utils/pdf/fonts.js
 * If neither exists, rendering will fall back to core fonts.
 */
async function ensurePdfFonts(doc) {
  // Already registered in this doc? Heuristic: setFont returns without throw.
  try {
    doc.setFont("NotoSans", "normal");
    return; // looks registered; skip fetching
  } catch {}

  // Prefer a local registrar if present
  try {
    const { registerPdfFonts } = await import("./fonts.js");
    await registerPdfFonts(doc);
    return;
  } catch {}

  // Fallback to the public facade registrar if present
  try {
    const { registerPdfFonts } = await import("../pdf/fonts.js");
    await registerPdfFonts(doc);
  } catch {
    // non-fatal: renderer will use Helvetica/Courier fallbacks
  }
}

/**
 * Determines a layout plan for the given song sections.
 *
 * The planner performs a "no-split" layout pass, meaning sections are never
 * broken across columns or pages. It iterates font sizes and column counts
 * until everything fits, then falls back to 15pt 1-col multipage as last resort.
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
 * Kept separate from planning so the same plan can be reused or inspected.
 *
 * @param {import("jspdf").jsPDF} doc - Target document.
 * @param {string} songTitle - Title shown in the header.
 * @param {Array<object>} sections - Original sections with content.
 * @param {object} plan - Layout plan produced by {@link planSong}.
 * @param {object} opts - Rendering options. Supports:
 *   - pageSizePt {w,h}
 *   - marginsPt {top,left,right,bottom}
 *   - gutterPt number
 *   - fontPt number
 *   - songKey string (for "Key of ___" on page 1)
 * @returns {Promise<void>}
 */
export async function renderSongIntoDoc(doc, songTitle, sections, plan, opts) {
  await ensurePdfFonts(doc);
  return renderSongInto(doc, songTitle, sections, plan, opts);
}
