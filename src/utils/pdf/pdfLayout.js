// src/utils/pdf/pdfLayout.js
// Drop-in: telemetry + robust candidate enumeration/packing
// NOTE: Removed import of measureSectionHeight to avoid circular import with ./index.js

const PT_WINDOW = [16, 15, 14, 13, 12];

// === Trace helpers ===========================================================
const isTraceOn = () => {
  try { return typeof window !== 'undefined' && window.localStorage?.getItem('pdfPlanTrace') === '1'; }
  catch { return false; }
};

// === Helper: derive a per-pt measurement callback from args ===================
function deriveMeasureCb(args) {
  if (typeof args?.measureSectionsForPt === 'function') return args.measureSectionsForPt;
  // Back-compat: if caller provides sections + per-section measure function
  if (Array.isArray(args?.sections) && typeof args?.measureSectionAtPt === 'function') {
    const sections = args.sections;
    const measureOne = args.measureSectionAtPt;
    return (pt) => sections.map((s, i) => {
      const m = measureOne(s, pt);
      // normalize minimal shape we need: { id, height, type? }
      return {
        id: m?.id ?? s?.id ?? (i + 1),
        height: m?.height ?? m?.h ?? 0,
        type: m?.type ?? s?.type,
      };
    });
  }
  return null;
}


const pushTrace = (rows, row) => { if (isTraceOn()) rows.push(row); };
const flushTrace = (label, rows) => {
  if (isTraceOn() && rows.length) {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[pdfPlanTrace] ${label}`);
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
};

// === Column packer (no section splitting; respect soft breaks) ===============
/**
 * @param {Array<{id:number,type?:string,height:number,postSpacing?:number}>} sections
 * @param {number} cols
 * @param {number} colHeight     usable height of a column in points
 * @param {{honorColumnBreaks?:boolean}} opts
 */
function packIntoColumns(sections, cols, colHeight, opts = {}) {
  const honorColumnBreaks = !!opts.honorColumnBreaks;
  const colHeights = new Array(cols).fill(0);
  const placed = Array.from({ length: cols }, () => []);
  let col = 0;
  let reasonRejected = '';
  // Guard: if sections are missing, treat as not-fit (let caller decide)
  if (!Array.isArray(sections)) {
    return {
      singlePage: false,
      colHeights,
      occupancy: colHeights.map(() => 0),
      balance: cols === 2 ? 1 : 1,
      reasonRejected: 'no_sections_provided',
      placed,
    };
  }


  const nextFitsInNextCol = (nextIdx) => {
    if (col + 1 >= cols) return false;
    const s = sections[nextIdx];
    if (!s) return false;
    return s.height <= (colHeight - colHeights[col + 1]);
  };

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];

    // Soft column break marker
    if (honorColumnBreaks && s.type === 'column_break') {
      if (nextFitsInNextCol(i + 1)) col += 1;
      continue; // skip marker itself
    }

    const remaining = colHeight - colHeights[col];
    if (s.height <= remaining) {
      placed[col].push(s.id);
      colHeights[col] += s.height;
    } else if (col + 1 < cols) {
      // move to next column and try once more
      col += 1;
      const remainingNext = colHeight - colHeights[col];
      if (s.height <= remainingNext) {
        placed[col].push(s.id);
        colHeights[col] += s.height;
      } else {
        reasonRejected = `section ${s.id} needs ${Math.ceil(s.height)}pt > remaining ${Math.floor(remainingNext)}pt in col ${col + 1}`;
        return {
          singlePage: false,
          colHeights,
          occupancy: colHeights.map(h => h / colHeight),
          balance: cols === 2 ? (1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight) : 1,
          reasonRejected,
          placed,
        };
      }
    } else {
      reasonRejected = `section ${s.id} needs ${Math.ceil(s.height)}pt > remaining ${Math.floor(remaining)}pt in col ${col + 1}`;
      return {
        singlePage: false,
        colHeights,
        occupancy: colHeights.map(h => h / colHeight),
        balance: cols === 2 ? (1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight) : 1,
        reasonRejected,
        placed,
      };
    }
  }

  return {
    singlePage: true,
    colHeights,
    occupancy: colHeights.map(h => h / colHeight),
    balance: cols === 2 ? (1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight) : 1,
    reasonRejected: undefined,
    placed,
  };
}

// === Scoring for single-page candidates only =================================
function scoreCandidate({ pt, cols, balance, occupancy, hasColumnsHint }) {
  let penalties = 0;
  if (cols === 2) {
    const minOcc = Math.min(...occupancy);
    if (minOcc < 0.18) penalties += 50;   // tiny second column → prefer 1‑col at same pt
  }
  if (occupancy.some(o => o > 0.98)) penalties += 5; // too tight
  if (hasColumnsHint && cols === 2) penalties -= 3;  // small nudge only
  const finalScore = (pt * 100) + (balance * 10) - penalties - (cols === 2 ? 2 : 0);
  return { penalties, finalScore };
}

// === Main planner entry =======================================================
/**
 * Evaluate 16→12pt, try 1‑col & 2‑col at each size.
 * Prefer any single‑page option over multipage. Return winner + debug footer.
 *
 * @param {{
 *   measuredSections?: Array<{id:number,height:number,type?:string}>,
 *   measureSectionsForPt?: (pt:number)=>Array<{id:number,height:number,type?:string}>,
 *   sections?: any[],
 *   measureSectionAtPt?: (section:any, pt:number)=>{id?:number,height:number,type?:string}, *   pageContentHeight: number,
 *   hasColumnsHint?: boolean,
 *   honorColumnBreaks?: boolean
 * }} args
 */
export function chooseBestPlan({
  measuredSections,
  measureSectionsForPt,
  sections,
  measureSectionAtPt,
  pageContentHeight,
  hasColumnsHint = false,
  honorColumnBreaks = true,
  ptWindow = PT_WINDOW,
}) {
  const traceRows = [];
  const singlePage = [];
  const measureCb = measureSectionsForPt || deriveMeasureCb({ measureSectionsForPt, sections, measureSectionAtPt });


  for (const pt of ptWindow) {
    const colHeight = pageContentHeight; // heights already reflect pt upstream
    for (const cols of [1, 2]) {
      // Use per-pt measurements if available; fallback to provided measuredSections (static)
      const ms = typeof measureCb === 'function' ? measureCb(pt) : measuredSections;
      const pack = packIntoColumns(ms, cols, colHeight, { honorColumnBreaks });
      const rowBase = {
        pt, cols,
        singlePage: pack.singlePage,
        colHeights: pack.colHeights.map(v => Math.round(v)),
        occupancy: pack.occupancy.map(v => Number(v.toFixed(2))),
        balance: Number(pack.balance.toFixed(2)),
      };
      if (!pack.singlePage) {
        pushTrace(traceRows, { ...rowBase, penalties: '', finalScore: '', reasonRejected: pack.reasonRejected });
        continue;
      }
      const { penalties, finalScore } = scoreCandidate({
        pt, cols, balance: pack.balance, occupancy: pack.occupancy, hasColumnsHint,
      });
      singlePage.push({ pt, cols, pack, penalties, finalScore });
        const why = pack.reasonRejected || (!ms ? 'no_measurements_for_pt' : 'rejected');
        pushTrace(traceRows, { ...rowBase, penalties: '', finalScore: '', reasonRejected: why });
    }
  }

  if (singlePage.length) {
    singlePage.sort((a, b) => b.finalScore - a.finalScore);
    const win = singlePage[0];
    flushTrace('Single‑page candidate scan (16→12pt, 1/2 columns)', traceRows);
    const debugFooter = isTraceOn()
      ? `Plan: ${win.cols} col • ${win.pt}pt • singlePage=yes • occ=${JSON.stringify(win.pack.occupancy.map(o => o.toFixed(2)))} • bal=${win.pack.balance.toFixed(2)}`
      : '';
    return { ...win, debugFooter };
  }

  // Fallback: multipage at 12pt (legacy behavior)
  flushTrace('No single‑page candidates; falling back to multi‑page 12pt', traceRows);
  return { multipage: true, pt: 12, reason: 'no_single_page' };
}

// === Compatibility layer (exports expected by src/utils/pdf/index.js) =========

// Historically expected default options:
export const DEFAULT_LAYOUT_OPT = Object.freeze({
  honorColumnBreaks: true,
  hasColumnsHint: false,
  ptWindow: PT_WINDOW.slice(), // exposed for diagnostics
});

// Normalize hook (noop for now; keeps API stable)
export function normalizeSongInput(input) {
  return input;
}

// Compute column heights ad hoc (used by some callers for telemetry)
export function columnHeights(measuredSections, cols, colHeight, opts = {}) {
  return packIntoColumns(measuredSections, cols, colHeight, opts).colHeights;
}

// Older API alias: choose best layout given already-measured sections.
// Returns a small, stable shape similar to previous code.
export function chooseBestLayout(args) {
  const plan = chooseBestPlan(args);
  if (plan.multipage) return plan;
  return {
    pt: plan.pt,
    cols: plan.cols,
    singlePage: true,
    occupancy: plan.pack.occupancy,
    balance: plan.pack.balance,
    debugFooter: plan.debugFooter,
    // surfaced for downstream render
    placed: plan.pack.placed,
    colHeights: plan.pack.colHeights,
  };
}

// Older API alias: main entry some code calls `planSongLayout`
export function planSongLayout(args) {
  return chooseBestLayout(args);
}
