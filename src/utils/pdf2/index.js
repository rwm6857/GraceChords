// pdf2 entry (JS). Exposes planner+renderer helpers.
// This experimental engine currently runs alongside the legacy pdf
// generator. The facade at src/utils/pdf/index.js chooses which engine
// to invoke while we transition.

import { planLayout } from "./planner.js";
import { renderSongInto } from "./renderer.js";

export async function planSong(sections, opts) {
  const { plan, fontPt } = await planLayout(sections, opts);
  return { plan, fontPt };
}

export async function renderSongIntoDoc(doc, songTitle, sections, plan, opts) {
  return renderSongInto(doc, songTitle, sections, plan, opts);
}
