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
      // Use per-pt measurements if available; fallback to provided measuredSections (static).
      // If neither is available, do NOT attempt to pack — just trace and continue.
      const ms = typeof measureCb === 'function' ? measureCb(pt) : measuredSections;
      if (!Array.isArray(ms)) {
        pushTrace(traceRows, {
          pt, cols, singlePage: false,
          colHeights: [], occupancy: [], balance: 1,
          penalties: '', finalScore: '',
          reasonRejected: 'no_measurements_for_pt',
        });
        continue;
      }
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
      pushTrace(traceRows, { ...rowBase, penalties, finalScore });
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

// Older API alias (args-based): choose best layout given already-measured sections.
// Returns a small, stable shape similar to previous code.
export function chooseBestLayoutFromArgs(args) {
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
  return chooseBestLayoutFromArgs(args);
}

// ============================================================================
// Legacy-compatible chooseBestLayout(song, oBase, makeLyric, makeChord)
// Builds a full { plan } with layout.pages[].columns[].blocks[]
// ============================================================================

/**
 * Old signature shim:
 * @param {object} song  // normalized, ideally with song.blocks[] already
 * @param {object} oBase // layout options (margin, headerOffsetY, lyricFamily, chordFamily, gutter?)
 * @param {function} makeLyric // jsPDF measure fn factory (doc, family, weight) -> (pt) -> (text)=>width
 * @param {function} makeChord // same for chord font
 * @returns {{ plan: any }}
 */
export function chooseBestLayout(song, oBase, makeLyric, makeChord) {
 // --- 1) Compute page content geometry ------------------------------------
  const margin = oBase.margin ?? 36;
  const headerOffsetY = oBase.headerOffsetY ?? 0;
  const pageWidth = oBase.pageWidth ?? 612;  // Letter default
  const pageHeight = oBase.pageHeight ?? 792;
  const contentStartY = margin + headerOffsetY;
  const contentHeight = pageHeight - contentStartY - margin;
  const contentWidth = pageWidth - margin * 2;
  const gutter = oBase.gutter ?? 24;

  // --- 2) Normalize song into sections of blocks ---------------------------
  // We treat each "section header" block (type==='section') as a hard boundary.
  const blocks = Array.isArray(song?.blocks) ? song.blocks : [];
  const sections = [];
  let cur = null;
  for (const b of blocks) {
    if (b?.type === 'section') {
      cur = { header: b.header || b.name || 'Section', blocks: [b] };
      sections.push(cur);
    } else {
      if (!cur) { cur = { header: 'Section', blocks: [] }; sections.push(cur); }
      cur.blocks.push(b);
    }
  }
  if (!sections.length) {
    // Fallback: a single empty section to keep renderer stable
    sections.push({ header: 'Section', blocks: [] });
  }

  // --- 3) A quick section height model (pt-dependent) ----------------------
  // Uses the same fonts as render; no split/wrap here since renderer handles text drawing.
  const lyricWidthAt = (pt, text) => {
    const m = makeLyric(pt);
    try { return m(text || ''); } catch { return 0; }
  };
  const chordWidthAt = (pt, text) => {
    const m = makeChord(pt);
    try { return m(text || ''); } catch { return 0; }
  };
  const measureSectionsAtPt = (pt) => {
    const lineGap = 4;
    const secTopPad = Math.round(pt * 0.85);
    return sections.map((sec, i) => {
      let h = secTopPad; // header
      for (const b of sec.blocks) {
        if (b.type === 'section') {
          // header already accounted via secTopPad
          continue;
        }
        if (b.type === 'line') {
          if (b.comment) {
            const cpt = Math.max(10, pt - 2);
            // width call warms cache; height increment approximates comment line height
            void lyricWidthAt(cpt, b.comment);
            h += cpt;
            continue;
          }
          if (Array.isArray(b.chords) && b.chords.length) {
            // width calls just warm any caching; height increment ~ chord row
            void chordWidthAt(pt, b.chords.map(c => c?.sym || '').join(' '));
            h += pt + (lineGap / 2);
          }
          void lyricWidthAt(pt, b.lyrics || '');
          h += pt + lineGap;
        }
      }
      if (h < secTopPad + pt) h = secTopPad + pt;
      return { id: i + 1, type: 'section', height: h, header: sec.header };
    });
  };

  // --- 4) Use new engine to choose pt/columns (single page priority) -------
  const hasColumnsHint = !!(song?.meta?.columns === 2 || song?.hints?.columns === 2);
  const singlePageCandidates = [];
  for (const pt of DEFAULT_LAYOUT_OPT?.ptWindow || [16,15,14,13,12]) {
    const ms = measureSectionsAtPt(pt);
    for (const cols of [1, 2]) {
      const pack = packIntoColumns(ms, cols, contentHeight, { honorColumnBreaks: true });
      if (!pack.singlePage) continue;
      const { penalties, finalScore } = scoreCandidate({
        pt, cols, balance: pack.balance, occupancy: pack.occupancy, hasColumnsHint,
      });
      singlePageCandidates.push({ pt, cols, pack, penalties, finalScore });
    }
  }
  if (!singlePageCandidates.length) {
    // Fallback: old 12pt multipage (keep shape stable)
    const plan = {
      lyricFamily: oBase.lyricFamily || 'Helvetica',
      chordFamily: oBase.chordFamily || 'Courier',
      lyricSizePt: 12,
      chordSizePt: 12,
      columns: 1,
      margin,
      headerOffsetY,
      gutter,
      layout: { pages: [] },
      debugFooter: isTraceOn() ? 'Plan: 1 col • 12pt • singlePage=no' : undefined,
    };
    // Minimal 2-page fallback (stuff everything in page1 col1, page2 empty), so renderer doesn’t explode
    plan.layout.pages = [{ columns: [{ x: margin, blocks }] }, { columns: [{ x: margin, blocks: [] }] }];
    return { plan };
  }
  singlePageCandidates.sort((a, b) => b.finalScore - a.finalScore);
  const win = singlePageCandidates[0];

  // --- 5) Build legacy layout.pages from packed section indices -------------
  const pt = win.pt;
  const cols = win.cols;
  const colW = cols === 2 ? (contentWidth - gutter) / 2 : contentWidth;

  // Map measured sections (with .id matching index+1) back to actual block spans
  // First, pre-split original blocks into per-section arrays
  const blocksBySection = sections.map(s => s.blocks);

  // Convert "placed section ids per column" into actual block arrays
  const page = { columns: [] };
  for (let c = 0; c < cols; c++) {
    const placedIds = win.pack.placed[c] || [];
    const colBlocks = [];
    for (const sid of placedIds) {
      // Append all blocks of that section in order
      const sBlocks = blocksBySection[sid - 1] || [];
      // Ensure there is a visible section header block at column transitions
      // (Most inputs already have the header block as first item. If not, synthesize one.)
      if (!sBlocks.length || sBlocks[0]?.type !== 'section') {
        colBlocks.push({ type: 'section', header: sections[sid - 1]?.header || `Section ${sid}` });
      }
      colBlocks.push(...sBlocks);
    }
    page.columns.push({ x: margin + c * (colW + (c ? gutter : 0)), blocks: colBlocks });
  }

  const plan = {
    lyricFamily: oBase.lyricFamily || 'Helvetica',
    chordFamily: oBase.chordFamily || 'Courier',
    lyricSizePt: pt,
    chordSizePt: pt,
    columns: cols,
    margin,
    headerOffsetY,
    gutter,
    layout: { pages: [page] },
    debugFooter: isTraceOn()
      ? `Plan: ${cols} col • ${pt}pt • singlePage=yes • occ=${JSON.stringify(win.pack.occupancy.map(o => o.toFixed(2)))} • bal=${win.pack.balance.toFixed(2)}`
      : undefined,
  };

  return { plan };
}
