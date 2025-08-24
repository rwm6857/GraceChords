// pdf2 entry (JS). Exposes planner+renderer helpers.

import { planLayout } from "./planner.js";
import { renderSongInto } from "./renderer.js";

export async function planSong(sections, opts) {
  const { plan, fontPt } = await planLayout(sections, opts);
  return { plan, fontPt };
}

export async function renderSongIntoDoc(doc, songTitle, sections, plan, opts) {
  return renderSongInto(doc, songTitle, sections, plan, opts);
}
