// Public PDF API used by components (SongView, Setlist, Songbook).
// pdf2 currently runs alongside the legacy engine; this facade delegates to
// the newer implementation while keeping a fallback to the old generator.

import jsPDF from "jspdf";
import { planSong, renderSongIntoDoc } from "../pdf2/index.js";
import { downloadSingleSongPdf as downloadSingleSongPdfMvp } from "../pdf_mvp/index.js";

// Lazy legacy import for fallback when pdf2 isn't available
let legacyPromise;
async function loadLegacy() {
  legacyPromise ||= import("./index - Copy.js");
  return legacyPromise;
}

const TRACE_ON = (() => {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem("pdfPlanTrace") === "1"
    );
  } catch {
    return false;
  }
})();

function debugTraceSections(sections) {
  if (!TRACE_ON) return;
  const rows = sections.map((s) => ({ id: s.id, len: (s.text || "").length }));
  console.table(rows);
}

function debugWarnFirstPage(plan) {
  if (!TRACE_ON) return;
  const count =
    plan.pages?.[0]?.columns?.reduce((n, c) => n + (c.sectionIds?.length || 0), 0) ||
    0;
  if (count === 0) console.warn("[pdf2] first page received zero sections");
}

// --- Shared defaults ---------------------------------------------------------
const defaultOpts = {
  ptWindow: [16, 15, 14, 13, 12],
  maxColumns: 2,
  pageSizePt: { w: 612, h: 792 }, // Letter
  marginsPt: { top: 56, right: 40, bottom: 56, left: 40 },
  gutterPt: 24,
};

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
  if (!Array.isArray(songs) || songs.length === 0) return;
  try {
    const opts = { ...defaultOpts };

    const doc = createJsPdfDoc({
      unit: "pt",
      format: [opts.pageSizePt.w, opts.pageSizePt.h],
    });
    tryRegisterFonts(doc);

    let firstPage = true;
    for (const song of songs) {
      const sections = sectionsFromSong(song);
      debugTraceSections(sections);
      const { plan, fontPt } = await planSong(sections, opts);
      debugWarnFirstPage(plan);
      if (!firstPage) doc.addPage([opts.pageSizePt.w, opts.pageSizePt.h]);
      firstPage = false;
      renderSongIntoDoc(doc, song?.title || "Untitled", sections, plan, {
        ...opts,
        fontPt,
        songKey: song?.key || song?.originalKey,
      });
    }

    const blob = doc.output("blob");
    triggerDownload(blob, `setlist-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    console.warn("pdf2 multi-song failed; falling back to legacy", err);
    const legacy = await loadLegacy();
    return legacy.downloadMultiSongPdf(songs);
  }
}

// Songbook export (cover, TOC, numbered songs; one per page)
export async function downloadSongbookPdf(
  songs = [],
  { includeTOC = true, coverImageDataUrl = null } = {}
) {
  if (!Array.isArray(songs) || songs.length === 0) return;
  try {
    const opts = { ...defaultOpts };

    const doc = createJsPdfDoc({
      unit: "pt",
      format: [opts.pageSizePt.w, opts.pageSizePt.h],
    });
    tryRegisterFonts(doc);

    // Cover page
    let pageNumber = 1;
    if (coverImageDataUrl) {
      try {
        // Fit image centered while preserving aspect ratio
        const availW =
          opts.pageSizePt.w - opts.marginsPt.left - opts.marginsPt.right;
        const availH =
          opts.pageSizePt.h - opts.marginsPt.top - opts.marginsPt.bottom;
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = coverImageDataUrl;
        });
        const scale = Math.min(availW / img.width, availH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = opts.marginsPt.left + (availW - w) / 2;
        const y = opts.marginsPt.top + (availH - h) / 2;
        doc.addImage(coverImageDataUrl, undefined, x, y, w, h, undefined, "FAST");
      } catch {
        /* ignore image issues */
      }
    } else {
      doc.setFontSize(28);
      doc.text("Songbook", opts.pageSizePt.w / 2, opts.pageSizePt.h / 2, {
        align: "center",
        baseline: "middle",
      });
    }

    // Build TOC first (to know page numbers)
    const titles = songs.map((s) => String(s?.title || "Untitled"));
    const songPageMap = new Map(); // title -> page start
    let currentPage = pageNumber + 1; // first song page follows cover (and TOC if present)

    if (includeTOC) currentPage++; // reserve a page for TOC

    // Precompute pages per song
    const preplans = [];
    for (let i = 0; i < songs.length; i++) {
      const sections = sectionsFromSong(songs[i]);
      debugTraceSections(sections);
      const { plan, fontPt } = await planSong(sections, opts);
      debugWarnFirstPage(plan);
      preplans.push({ sections, plan, fontPt });
      const pagesForSong = Math.max(1, plan.pages?.length || 1);
      songPageMap.set(titles[i], currentPage);
      currentPage += pagesForSong;
    }

    // TOC page
    if (includeTOC) {
      doc.addPage([opts.pageSizePt.w, opts.pageSizePt.h]);
      doc.setFontSize(18);
      doc.text("Table of Contents", opts.marginsPt.left, opts.marginsPt.top);
      doc.setFontSize(12);

      const leftX = opts.marginsPt.left;
      const rightX = opts.pageSizePt.w / 2 + 10;
      const topY = opts.marginsPt.top + 24;
      const lineH = 16;
      const mid = Math.ceil(titles.length / 2);
      let yL = topY,
        yR = topY;
      for (let i = 0; i < titles.length; i++) {
        const title = titles[i];
        const pg = songPageMap.get(title);
        const text = `${i + 1}. ${title}  ....  ${pg}`;
        if (i < mid) {
          doc.text(text, leftX, yL);
          yL += lineH;
        } else {
          doc.text(text, rightX, yR);
          yR += lineH;
        }
      }
    }

    // Songs (numbered)
    for (let i = 0; i < songs.length; i++) {
      const songNo = i + 1;
      const title = titles[i];
      const { sections, plan, fontPt } = preplans[i];
      const song = songs[i];
      const numberedTitle = `${songNo}. ${title}`;

      // First page with header
      const firstPagePlan = { ...plan, pages: plan.pages.slice(0, 1) };
      renderSongIntoDoc(doc, numberedTitle, sections, firstPagePlan, {
        ...opts,
        fontPt,
        songKey: song?.key || song?.originalKey,
      });

      // Remaining pages without header/subtitle
      if (plan.pages.length > 1) {
        const restPlan = { ...plan, pages: plan.pages.slice(1) };
        renderSongIntoDoc(doc, "", sections, restPlan, { ...opts, fontPt });
      }
    }

    // jsPDF starts with one page by default; cover consumed it already.
    const blob = doc.output("blob");
    triggerDownload(blob, `songbook-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    console.warn("pdf2 songbook failed; falling back to legacy", err);
    const legacy = await loadLegacy();
    return legacy.downloadSongbookPdf(songs, { includeTOC, coverImageDataUrl });
  }
}
