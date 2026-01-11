/**
 * One-time generator for the M’Cheyne reading plan.
 * Outputs: src/components/readings/data/mcheyne.plan.json
 *
 * Run:
 *   npm run generate:mcheyne
 *
 * After running, COMMIT the generated JSON file.
 */

import fs from "node:fs";
import path from "node:path";

const SOURCE_URL = "https://bibleplan.org/plans/mcheyne/";
const OUT_PATH = path.resolve("src/components/readings/data/mcheyne.plan.json");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthNameToNum(name) {
  const map = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const n = map[name.toLowerCase()];
  if (!n) throw new Error(`Unknown month: ${name}`);
  return n;
}

function decodeEntities(s) {
  return s
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripTagsKeepLines(html) {
  // Keep basic line breaks so we can regex across lines.
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function normalizeWhitespace(s) {
  // Preserve newlines, normalize spaces
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Matches lines like:
 * "Thursday January 1st: Family: Genesis 1 | Matthew 1 Secret: Ezra 1 | Acts 1"
 * (weekday optional; ordinal suffix optional; punctuation may vary slightly)
 *
 * We capture: Month, Day, Family1, Family2, Secret1, Secret2
 */
function parseBiblePlan(text) {
  const items = [];

  const re =
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?:\s*Family:\s*([^|\n]+?)\s*\|\s*([^\n]+?)\s*Secret:\s*([^|\n]+?)\s*\|\s*([^\n]+?)(?=\n|$)/gi;

  let m;
  while ((m = re.exec(text)) !== null) {
    const month = monthNameToNum(m[1]);
    const day = Number(m[2]);

    const r1 = m[3].trim();
    const r2 = m[4].trim();
    const r3 = m[5].trim();
    const r4 = m[6].trim();

    items.push({
      mmdd: `${pad2(month)}${pad2(day)}`,
      readings: [r1, r2, r3, r4].map((s) => s.replace(/\s+/g, " ").trim()),
    });
  }

  // De-dupe by mmdd (defensive)
  const by = new Map();
  for (const it of items) {
    if (!by.has(it.mmdd)) by.set(it.mmdd, it);
  }
  const out = [...by.values()].sort((a, b) => a.mmdd.localeCompare(b.mmdd));

  if (out.length !== 365) {
    throw new Error(`Parsed ${out.length} entries; expected 365.`);
  }
  return out;
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "GraceChords/plan-generator" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const text = normalizeWhitespace(decodeEntities(stripTagsKeepLines(html)));

  const plan = parseBiblePlan(text);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(plan, null, 2) + "\n", "utf8");
  console.log(`Wrote ${plan.length} entries -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
