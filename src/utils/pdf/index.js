// Public PDF API facade. Delegates to the MVP engine and exposes
// `sectionsFromSong` for tests/utilities.

import {
  downloadSingleSongPdf as downloadSingleSongPdfMvp,
  downloadMultiSongPdf as downloadMultiSongPdfMvp,
  downloadSongbookPdf as downloadSongbookPdfMvp,
} from "../pdf_mvp/index.js";

// Sections builder: convert a NormalizedSong into simple text "sections"
// (no-split paragraphs). Chords are rendered inline by injecting
// bracketed tokens at their positions.
function toInlineChords(plain = "", chordPositions = []) {
  if (!Array.isArray(chordPositions) || chordPositions.length === 0) return plain;
  const chars = Array.from(plain);
  const inserts = chordPositions
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((c) => ({ i: Math.max(0, Math.min(chars.length, c.index | 0)), t: `[${c.sym}]` }));
  // Insert from end to keep indices valid
  for (let k = inserts.length - 1; k >= 0; k--) {
    const { i, t } = inserts[k];
    chars.splice(i, 0, t);
  }
  return chars.join("");
}

function sectionsFromSong(song) {
  const out = [];
  let blocks = [];

  // Support both legacy `lyricsBlocks` and normalized `sections` shapes.
  if (Array.isArray(song?.lyricsBlocks)) {
    blocks = song.lyricsBlocks.map((b) => ({
      section: b.section,
      lines: (b.lines || []).map((ln) => ({
        plain: ln.plain ?? ln.lyrics ?? "",
        chordPositions: ln.chordPositions ?? ln.chords ?? [],
        comment: ln.comment,
      })),
    }));
  } else if (Array.isArray(song?.sections)) {
    blocks = song.sections.map((s) => ({
      section: s.label || s.kind,
      lines: (s.lines || []).map((ln) => ({
        plain: ln.plain ?? ln.lyrics ?? "",
        chordPositions: ln.chordPositions ?? ln.chords ?? [],
        comment: ln.comment,
      })),
    }));
  }

  let idCounter = 1;
  for (const b of blocks) {
    let buf = "";
    if (b?.section) buf += `[${b.section}]\n`;
    for (const ln of b?.lines || []) {
      if (ln?.comment) {
        buf += `(${ln.comment})\n`;
        continue;
      }
      const textWithChords = toInlineChords(
        ln?.plain || "",
        ln?.chordPositions || []
      );
      buf += `${textWithChords}\n`;
    }
    // trim trailing newline; add a spacer line to separate sections visually
    buf = buf.replace(/\n+$/, "");
    out.push({ id: `s${idCounter++}`, text: buf, postSpacing: 10 });
  }
  return out;
}

export { sectionsFromSong };

function createJsPdfDoc(opts) {
  const JsPDFCtor = (typeof window !== "undefined" && window.jsPDF) || jsPDF;
  if (typeof JsPDFCtor !== "function") {
    throw new Error(
      'jsPDF is not available (window.jsPDF is undefined). Include it via <script src="https://cdn.jsdelivr.net/npm/jspdf"></script>.'
    );
  }
  try {
    return new JsPDFCtor(opts);
  } catch {
    throw new Error(
      "Failed to initialize jsPDF. Ensure the jsPDF script is correctly included."
    );
  }
}

// Registers fonts if available; safe to no-op if your build already embeds Noto.
function tryRegisterFonts(doc) {
  try {
    // If you load custom fonts elsewhere, you can set them here too.
    doc.setFont("NotoSans", "normal");
  } catch {
    /* ignore */
  }
}

// Download helper
function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// -----------------------------------------------------------------------------
// Exposed helpers

// SongView single-song export
export async function downloadSingleSongPdf(song, { lyricSizePt = 16 } = {}) {
  // Route to MVP engine for single-song export per product direction.
  // Ignores lyricSizePt and follows 15→11pt decision ladder.
  return downloadSingleSongPdfMvp(song)
}

// Setlist multi-song export (each song starts on a new page)
export async function downloadMultiSongPdf(songs = []) {
  return downloadMultiSongPdfMvp(songs);
}

// Songbook export (cover, TOC, numbered songs; one per page)
export async function downloadSongbookPdf(
  songs = [],
  { includeTOC = true, coverImageDataUrl = null } = {}
) {
  return downloadSongbookPdfMvp(songs, { includeTOC, coverImageDataUrl });
}
