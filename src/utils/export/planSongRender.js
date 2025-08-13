// Shared export planning for PDF & JPG across SongView, Setlist, Songbook.
// Input can be a single song or an array of songs (for setlist/songbook).
// Output is a stable "plan" consumed by exportPdf/exportImage.
/**
 * @typedef {Object} Song
 * @property {string} id
 * @property {string} title
 * @property {string} originalKey
 * @property {Array<{type:string, lines:string[]}>} sections
 */
/**
 * @typedef {Object} PlanOptions
 * @property {'auto'|1|2} columns
 * @property {number} baseFontPt
 * @property {boolean} showChords
 * @property {boolean} transpose
 * @property {string} pageSize // e.g., 'LETTER' or 'A4'
 * @property {number} maxLinesPerColumn // safety for widow/orphan
 * @property {string} docTitle // optional override
 */

const DEFAULTS = {
  columns: 'auto',
  baseFontPt: 12,
  showChords: true,
  transpose: false,
  pageSize: 'LETTER',
  maxLinesPerColumn: 60,
};

/**
 * Compute non-splitting blocks from sections.
 * Ensures each section stays intact (never split a section),
 * with a minimal keep-with-next for last 2 lines to prevent widows/orphans.
 */
function computeBlocks(songsOrSong) {
  const songs = Array.isArray(songsOrSong) ? songsOrSong : [songsOrSong];
  const blocks = [];
  songs.forEach((song, idx) => {
    blocks.push({
      kind: 'songHeader',
      title: song.title || 'Untitled',
      keepWithNext: 1,
      meta: { songIndex: idx },
    });
    (song.sections || []).forEach((sec, sIdx) => {
      blocks.push({
        kind: 'section',
        title: sec.type, // e.g., "Verse 1", "Chorus"
        lines: sec.lines || [],
        // keep entire section together; plus clamp last lines to avoid widow/orphan
        keepTogether: true,
        keepLastNWithNext: 2,
        meta: { songIndex: idx, sectionIndex: sIdx },
      });
    });
  });
  return blocks;
}

function chooseColumns(opt, blocks) {
  if (opt.columns !== 'auto') return opt.columns;
  // very simple heuristic: > N lines → 2 columns, else 1
  const totalLines = blocks.reduce((acc, b) => acc + (b.lines ? b.lines.length : 2), 0);
  return totalLines > 48 ? 2 : 1;
}

function pageMetrics(pageSize) {
  // LETTER portrait metrics in points (1/72 in): margins tuned for chords
  if (pageSize === 'A4') return { width: 595.28, height: 841.89, margin: { t: 54, r: 48, b: 54, l: 48 } };
  return { width: 612, height: 792, margin: { t: 54, r: 48, b: 54, l: 48 } }; // LETTER
}

/**
 * Plan render for PDF/JPG.
 * @param {Song|Song[]} songsOrSong
 * @param {Partial<PlanOptions>} options
 */
export function planSongRender(songsOrSong, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const blocks = computeBlocks(songsOrSong);
  const cols = chooseColumns(opt, blocks);
  const metrics = pageMetrics(opt.pageSize);
  const docTitle =
    opt.docTitle ||
    (Array.isArray(songsOrSong)
      ? `Set — ${songsOrSong.map((s) => s.title || 'Untitled').join(', ')}`.slice(0, 200)
      : songsOrSong.title || 'Untitled');

  return {
    version: 1,
    page: { size: opt.pageSize, ...metrics },
    typography: {
      basePt: opt.baseFontPt,
      monoFamily: 'NotoSansMono',
      sansFamily: 'NotoSans',
      chordAboveLyric: true,
    },
    columns: cols,
    behavior: {
      showChords: opt.showChords,
      transpose: opt.transpose,
      keepTogetherSections: true,
      widowOrphanClamp: 2,
      maxLinesPerColumn: opt.maxLinesPerColumn,
    },
    blocks,
    docTitle,
    // Suggested raster size for JPG export; callers can override
    image: {
      dpi: 144,
      background: '#FFFFFF',
    },
  };
}

export default planSongRender;
