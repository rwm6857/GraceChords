// src/utils/pdf/pdfLayout.js
// Drop-in: telemetry + robust candidate enumeration/packing
// NOTE: Removed import of measureSectionHeight to avoid circular import with ./index.js

import { parseChordPro } from '../chordpro.js';
import { resolveChordCollisions } from '../chords.js';

const PT_WINDOW = [16, 15, 14, 13, 12];

// Default planner options used when callers do not specify overrides.
export const DEFAULT_LAYOUT_OPT = {
  pageWidth: 612,      // 8.5in * 72pt
  pageHeight: 792,     // 11in * 72pt
  margin: 36,
  headerOffsetY: 0,
  gutter: 18,
  lyricFamily: 'Helvetica',
  chordFamily: 'Courier',
  lyricSizePt: 16,
  chordSizePt: 16,
  columns: 1,
  ptWindow: PT_WINDOW,
};

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

// === Legacy column packer (no section splitting; respect soft breaks) ========
/**
 * @param {Array<{id:number,type?:string,height:number,postSpacing?:number}>} sections
 * @param {number} cols
 * @param {number} colHeight     usable height of a column in points
 * @param {{honorColumnBreaks?:boolean}} opts
 */
function packIntoColumnsLegacy(sections, cols, colHeight, opts = {}) {
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

// Runtime trace toggle: localStorage.setItem('pdfPlanTrace','1')
const PDF_TRACE = typeof window !== 'undefined'
  && (() => { try { return localStorage.getItem('pdfPlanTrace') === '1' } catch { return false } })()

/**
 * Normalize a song representation into the shape expected by PDF/image helpers.
 *
 * Normalized shape:
 * {
 *   title?: string,
 *   key?: string,
 *   capo?: number,
 *   layoutHints?: { columnBreakAfter?: number[] },
 *   sections: Array<{
 *     label?: string,
 *     lines: Array<{
 *       lyrics?: string,
 *       chords?: Array<{ sym: string, index: number }>,
 *       comment?: string,
 *     }>
 *   }>
 * }
 *
 * Legacy objects with `lyricsBlocks` are supported and converted.
 */
export function normalizeSongInput(input) {
  if (!input) return { sections: [], meta: {} };
  if (typeof input === 'string') {
    try {
      const parsed = parseChordPro(input);
      const sections = parsed.blocks.map(b => {
        const lines = (b.lines || []).map(ln => ({
          lyrics: ln.text,
          chords: ln.chords,
        }));
        const blocks = [
          { type: 'section', header: b.section },
          ...lines.map(ln => ({ type: 'line', lyrics: ln.lyrics, chords: ln.chords }))
        ];
        return { label: b.section, lines, blocks };
      });
      return { ...parsed.meta, sections };
    } catch {
      return { sections: [], meta: {} };
    }
  }
  if (typeof input === 'object') {
    if (Array.isArray(input?.lyricsBlocks)) {
      const { title, key, capo, layoutHints, meta, lyricsBlocks } = input;
      const sections = lyricsBlocks.map(b => {
        const lines = (b.lines || []).map(ln => ({
          lyrics: ln.plain,
          chords: ln.chordPositions,
          comment: ln.comment,
        }));
        const blocks = [
          { type: 'section', header: b.section },
          ...lines.map(ln => ln.comment
            ? { type: 'line', comment: ln.comment }
            : { type: 'line', lyrics: ln.lyrics, chords: ln.chords })
        ];
        return { label: b.section, lines, blocks };
      });
      return { title, key, capo, layoutHints, ...(meta || {}), sections };
    }
    if (Array.isArray(input?.sections)) {
      const sections = input.sections.map((s) => {
        const lines = s.lines || [];
        const blocks = s.blocks || [
          { type: 'section', header: s.label || s.kind },
          ...lines.map(ln => ln.comment
            ? { type: 'line', comment: ln.comment }
            : { type: 'line', lyrics: ln.lyrics, chords: ln.chords })
        ];
        return { ...s, lines, blocks };
      });
      return { ...input, sections };
    }
    return input;
  }
  return { sections: [], meta: {} };
}

// Packing helper: place whole sections into columns without splitting
export function packIntoColumns(sections, cols, colHeight, { honorColumnBreaks } = {}) {
  const placed = Array.from({ length: cols }, () => [])
  const colHeights = Array(cols).fill(0)
  let colIdx = 0

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]
    const h = sec.h
    const tightH = sec.hNoPad
    if (h > colHeight) {
      return {
        singlePage: false,
        colHeights,
        occupancy: colHeights.map(hh => hh / colHeight),
        balance: cols === 2 ? 0 : 1,
        placed,
        reasonRejected: `section ${i} height ${h}pt > column ${colHeight}pt`
      }
    }

    if (honorColumnBreaks && sec.breakBefore && colIdx < cols - 1 && colHeights[colIdx] > 0) {
      if (h <= colHeight) colIdx++
    }

    let avail = colHeight - colHeights[colIdx]
    if (h <= avail) {
      placed[colIdx].push(i)
      colHeights[colIdx] += h
    } else if (tightH <= avail) {
      placed[colIdx].push(i)
      colHeights[colIdx] += tightH
      colIdx++
      if (colIdx >= cols && i < sections.length - 1) {
        return {
          singlePage: false,
          colHeights,
          occupancy: colHeights.map(hh => hh / colHeight),
          balance: cols === 2 ? 1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight : 1,
          placed,
          reasonRejected: `section ${i + 1} needs ${h}pt > remaining ${avail}pt in col ${cols}`
        }
      }
    } else {
      colIdx++
      if (colIdx >= cols) {
        return {
          singlePage: false,
          colHeights,
          occupancy: colHeights.map(hh => hh / colHeight),
          balance: cols === 2 ? 1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight : 1,
          placed,
          reasonRejected: `section ${i} needs ${h}pt > remaining ${avail}pt in col ${colIdx}`
        }
      }
      i-- // retry this section in next column
      continue
    }

    if (colIdx >= cols) break
  }

  const occupancy = colHeights.map(hh => hh / colHeight)
  const balance = cols === 2 ? 1 - Math.abs(colHeights[0] - colHeights[1]) / colHeight : 1
  return { singlePage: true, colHeights, occupancy, balance, placed }
}

// Check if any line's lyrics or chords exceed the available column width
function widthOverflows(song, cols, pt, oBase, makeMeasureLyricAt, makeMeasureChordAt) {
  if (!song?.sections) return false
  const contentW = oBase.pageWidth - oBase.margin * 2
  const colW = cols === 2 ? (contentW - oBase.gutter) / 2 : contentW
  const measureLyric = makeMeasureLyricAt(pt)
  const measureChord = makeMeasureChordAt(pt)

  for (const sec of song.sections) {
    for (const ln of (sec.lines || [])) {
      if (ln.comment) {
        if (measureLyric(ln.comment) > colW) return true
        continue
      }
      const lyrics = ln.lyrics || ''
      let maxW = measureLyric(lyrics)
      const chords = (ln.chords || []).map(c => ({
        x: measureLyric(lyrics.slice(0, c.index || 0)),
        w: measureChord(c.sym || '')
      }))
      resolveChordCollisions(chords)
      for (const c of chords) {
        if (c.x + c.w > maxW) maxW = c.x + c.w
      }
      if (maxW > colW) return true
    }
  }
  return false
}

/**
 * Choose best layout using section packing and scoring.
 * Public API: signature must remain stable.
 */
export function chooseBestLayout(songIn, baseOpt = {}, makeMeasureLyricAt = () => () => 0, makeMeasureChordAt = () => () => 0) {
  const song = normalizeSongInput(songIn)
  const oBase = { ...DEFAULT_LAYOUT_OPT, ...baseOpt, gutter: DEFAULT_LAYOUT_OPT.gutter }
  const SIZE_STEPS = [16, 15, 14, 13, 12]
  const prefer2 = song.layoutHints?.requestedColumns === 2

  const contentH = oBase.pageHeight - (oBase.margin + oBase.headerOffsetY) - oBase.margin
  const secHeightsCache = {}
  const breakAfter = song.layoutHints?.columnBreakAfter || []

  const sectionHeightsAt = (pt) => {
    if (secHeightsCache[pt]) return secHeightsCache[pt]
    const lineGap = 4
    const secTopPad = Math.round(pt * 0.85)
    const commentSize = Math.max(10, pt - 2)
    const arr = (song.sections || []).map((sec, idx) => {
      let h = secTopPad + pt
      for (const ln of (sec.lines || [])) {
        if (ln.comment) {
          h += commentSize + 3
        } else {
          if (ln?.chords?.length) h += pt + lineGap / 2
          h += pt + lineGap
        }
      }
      if (!sec.lines?.length) h += pt
      h += 4
      return { h, hNoPad: h - 4, breakBefore: breakAfter.includes(idx) }
    })
    secHeightsCache[pt] = arr
    if (PDF_TRACE) {
      console.log('sectionHeights pt', pt, arr.map(s => s.h))
    }
    return arr
  }

  const candidates = []

  for (const pt of SIZE_STEPS) {
    for (const cols of [1, 2]) {
      const sections = sectionHeightsAt(pt)
      const pack = packIntoColumns(sections, cols, contentH, { honorColumnBreaks: true })
      const widthOk = !widthOverflows(song, cols, pt, oBase, makeMeasureLyricAt, makeMeasureChordAt)
      let penalties = 0
      if (cols === 2 && Math.min(...pack.occupancy) < 0.18) penalties += 50
      if (pack.occupancy.some(o => o > 0.98)) penalties += 5
      if (prefer2 && cols === 2) penalties -= 3
      const score = (pt * 100) + (pack.balance * 10) - penalties - (cols === 2 ? 2 : 0)
      candidates.push({ pt, cols, singlePage: pack.singlePage && widthOk, colHeights: pack.colHeights, occupancy: pack.occupancy, balance: pack.balance, penalties, finalScore: score, reasonRejected: widthOk ? pack.reasonRejected : 'width overflow', placed: pack.placed })
    }
  }

  if (PDF_TRACE) {
    console.table(candidates.map(c => ({ pt: c.pt, cols: c.cols, singlePage: c.singlePage, colHeights: c.colHeights.map(n => Number(n.toFixed(1))), occupancy: c.occupancy.map(o => Number(o.toFixed(2))), balance: Number(c.balance.toFixed(2)), penalties: c.penalties, finalScore: Number(c.finalScore.toFixed(2)), reasonRejected: c.reasonRejected || '' })))
    console.log('contentH', contentH, 'gutter', oBase.gutter)
  }

  const viable = candidates.filter(c => c.singlePage)
  if (viable.length) {
    const winner = viable.sort((a, b) => b.finalScore - a.finalScore)[0]
    const occStr = winner.occupancy.map(o => o.toFixed(2)).join(',')
    const debugFooter = `Plan: ${winner.cols} col • ${winner.pt}pt • singlePage=yes • occ=[${occStr}] • bal=${winner.balance.toFixed(2)}`

    // Build legacy plan
    const margin = oBase.margin
    const contentW = oBase.pageWidth - margin * 2
    const colW = winner.cols === 2 ? (contentW - oBase.gutter) / 2 : contentW
    const measureLyric = makeMeasureLyricAt(winner.pt)
    const measureChord = makeMeasureChordAt(winner.pt)
    const buildCol = (x, secIdxs) => {
      const blocks = []
      for (const si of secIdxs) {
        const sec = song.sections[si]
        blocks.push({ type: 'section', header: sec.label || sec.kind })
        for (const ln of (sec.lines || [])) {
          if (ln.comment) {
            blocks.push({ type: 'line', comment: ln.comment })
          } else {
            const chords = (ln.chords || []).map(c => ({ x: measureLyric((ln.lyrics || '').slice(0, c.index || 0)), w: measureChord(c.sym || ''), sym: c.sym }))
            resolveChordCollisions(chords)
            blocks.push({ type: 'line', lyrics: ln.lyrics || '', chords })
          }
        }
      }
      return { x, blocks }
    }

    const columns = [buildCol(margin, winner.placed[0] || [])]
    if (winner.cols === 2) {
      columns.push(buildCol(margin + colW + oBase.gutter, winner.placed[1] || []))
    }
    const layout = { pages: [{ columns }] }

    const plan = {
      lyricFamily: oBase.lyricFamily,
      chordFamily: oBase.chordFamily,
      lyricSizePt: winner.pt,
      chordSizePt: winner.pt,
      columns: winner.cols,
      margin: oBase.margin,
      headerOffsetY: oBase.headerOffsetY,
      gutter: oBase.gutter,
      layout,
      debugFooter
    }
    return { plan }
  }

  // Fallback: legacy two-page @12pt
  const minSz = 12
  let layout = planSongLayout(
    song,
    { ...oBase, columns: 1, lyricSizePt: minSz, chordSizePt: minSz },
    makeMeasureLyricAt(minSz),
    makeMeasureChordAt(minSz)
  )
  let plan = { ...oBase, columns: 1, lyricSizePt: minSz, chordSizePt: minSz, layout }
  if (!fitsWithinTwoPages(plan)) {
    layout = planSongLayout(
      song,
      { ...oBase, columns: 2, lyricSizePt: minSz, chordSizePt: minSz },
      makeMeasureLyricAt(minSz),
      makeMeasureChordAt(minSz)
    )
    plan = { ...oBase, columns: 2, lyricSizePt: minSz, chordSizePt: minSz, layout }
  }
  plan.debugFooter = `Plan: ${plan.columns} col • ${plan.lyricSizePt}pt • singlePage=${plan.layout.pages.length === 1 ? 'yes' : 'no'}`
  return { plan }
}

function fitsWithinTwoPages(plan) {
  return (plan?.layout?.pages?.length || 99) <= 2
}

// Public layout function (was computeLayout). Pure; does not select sizes/columns.
export function planSongLayout(songIn, opt = {}, measureLyric = (t) => 0, measureChord = (t) => 0) {
  const song = normalizeSongInput(songIn)
  const sections = Array.isArray(song.sections) ? song.sections : []
  const o = { ...DEFAULT_LAYOUT_OPT, ...opt, gutter: DEFAULT_LAYOUT_OPT.gutter }
  const lineGap = 4
  const sectionSize = o.lyricSizePt
  const sectionTopPad = Math.round(o.lyricSizePt * 0.85)
  const commentSize = Math.max(10, o.lyricSizePt - 2)

  const margin = o.margin
  const pageH = o.pageHeight
  const contentW = o.pageWidth - margin * 2
  const initialColW = o.columns === 2 ? (contentW - o.gutter) / 2 : contentW

  const contentStartY = margin + o.headerOffsetY
  const contentBottomY = pageH - margin
  const headerOffsetY = o.headerOffsetY
  const gutter = o.gutter
  const contentHeight = contentBottomY - contentStartY

  const makeLyric = pt => {
    if (typeof measureLyric !== 'function') return () => 0;
    try {
      const m = measureLyric(pt);
      if (typeof m === 'function') return m;
    } catch {}
    return measureLyric;
  };
  const makeChord = pt => {
    if (typeof measureChord !== 'function') return () => 0;
    try {
      const m = measureChord(pt);
      if (typeof m === 'function') return m;
    } catch {}
    return measureChord;
  };

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
  for (const pt of o.ptWindow ?? DEFAULT_LAYOUT_OPT.ptWindow) {
    const ms = measureSectionsAtPt(pt);
    for (const cols of [1, 2]) {
      const pack = packIntoColumnsLegacy(ms, cols, contentHeight, { honorColumnBreaks: true });
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
      lyricFamily: o.lyricFamily || 'Helvetica',
      chordFamily: o.chordFamily || 'Courier',
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
    const flatBlocks = sections.flatMap(s => s.blocks || []);
    plan.layout.pages = [{ columns: [{ x: margin, blocks: flatBlocks }] }, { columns: [{ x: margin, blocks: [] }] }];
    return { plan };
  }
  singlePageCandidates.sort((a, b) => b.finalScore - a.finalScore);
  const win = singlePageCandidates[0];

  // --- 5) Build legacy layout.pages from packed section indices -------------
  const pt = win.pt;
  const cols = win.cols;
  const colW = cols === 2 ? (contentW - gutter) / 2 : contentW;

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
    lyricFamily: o.lyricFamily || 'Helvetica',
    chordFamily: o.chordFamily || 'Courier',
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
