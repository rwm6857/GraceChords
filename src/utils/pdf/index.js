import { ensureFontsEmbedded } from './fonts'
import { planSongLayout, chooseBestLayout, normalizeSongInput, DEFAULT_LAYOUT_OPT } from './pdfLayout'
import { makeMeasure } from './measure'

// Debug switch: open DevTools and run localStorage.setItem('pdfDebug','1') to see guides
const PDF_DEBUG = typeof window !== 'undefined'
  && (() => { try { return localStorage.getItem('pdfDebug') === '1' } catch { return false } })()

/* -----------------------------------------------------------
 * Lazy jsPDF
 * --------------------------------------------------------- */
async function newPDF() {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ unit: 'pt', format: 'letter' })
}

/* -----------------------------------------------------------
 * Planner wrapper bound to jsPDF doc/fonts
 * --------------------------------------------------------- */
function planWithDoc(doc, song, baseOpt) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const oBase = { ...DEFAULT_LAYOUT_OPT, ...baseOpt, pageWidth: pageW, pageHeight: pageH }
  if (song?.meta?.capo && baseOpt?.showCapo !== false) {
    oBase.headerOffsetY = (oBase.headerOffsetY || DEFAULT_LAYOUT_OPT.headerOffsetY) + 14
  }
  const makeLyric = makeMeasure(doc, oBase.lyricFamily, 'normal')
  const makeChord = makeMeasure(doc, oBase.chordFamily, 'bold')
  const { plan } = chooseBestLayout(song, oBase, makeLyric, makeChord)
  return { plan }
}

/* -----------------------------------------------------------
 * DRAWING (consumes planned layout)
 * --------------------------------------------------------- */
function drawPlannedSong(doc, plan, { title, key, capo, showCapo = true }) {
  const lFam = String(plan.lyricFamily || 'Helvetica')
  const cFam = String(plan.chordFamily || 'Courier')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const margin = plan.margin
  const headerTitlePt = Math.max(22, plan.lyricSizePt + 6)
  const headerKeyPt   = Math.max(12, plan.lyricSizePt - 2)
  const lineGap = 4
  const sectionSize = plan.lyricSizePt
  const sectionTopPad = Math.round(plan.lyricSizePt * 0.85)
  const contentStartY = margin + plan.headerOffsetY
  const contentW = pageW - margin * 2
  const colW = plan.columns === 2 ? (contentW - plan.gutter) / 2 : contentW

  plan.layout.pages.forEach((p, pIdx) => {
    if (pIdx > 0) doc.addPage()
    // Header
    doc.setFont(lFam, 'bold');   doc.setFontSize(headerTitlePt)
    doc.text(title, margin, margin + 24)
    doc.setFont(lFam, 'italic'); doc.setFontSize(headerKeyPt)
    doc.text(`Key: ${key || '—'}`, margin, margin + 40)
    if (showCapo && typeof capo === 'number') {
      doc.text(`Capo: ${capo}`, margin, margin + 54)
    }

    if (PDF_DEBUG) {
      doc.setDrawColor(180)
      doc.rect(margin, contentStartY, colW, pageH - margin - contentStartY)
      if (plan.columns === 2) {
        doc.rect(margin + colW + plan.gutter, contentStartY, colW, pageH - margin - contentStartY)
      }
      // Approximate occupancy for footer without relying on planner internals.
      // (Prevents calling columnHeights() with the wrong shape.)
      const colH = pageH - margin - contentStartY
      const approxOcc = plan.layout.pages.length === 1 ? 0.64 : 1.02 // keep your prior number if single page
      const approxBal = plan.columns === 2 ? 0.95 : 1.00
      const occInfo = ` • occ=${approxOcc.toFixed(2)} • bal=${approxBal.toFixed(2)}`

      doc.setFont(lFam, 'normal'); doc.setFontSize(9)
      doc.text(plan.debugFooter || '', margin, pageH - (margin * 0.6))
    }

    p.columns.forEach((col) => {
      let x = col.x
      let y = contentStartY
      for (const b of col.blocks) {
        if (b.type === 'section') {
          y += sectionTopPad
          doc.setFont(lFam, 'bold'); doc.setFontSize(sectionSize)
          doc.text(`[${b.header}]`, x, y)
          y += sectionSize + 4
        } else if (b.type === 'line') {
          if (b.comment) {
            const pt = Math.max(10, plan.lyricSizePt - 2)
            doc.setFont(lFam, 'italic'); doc.setFontSize(pt)
            doc.setTextColor(120)
            doc.text(b.comment, x, y)
            doc.setTextColor(0)
            y += pt + 3
          } else {
            if (b.chords?.length) {
              doc.setFont(cFam, 'bold'); doc.setFontSize(plan.chordSizePt)
              for (const c of b.chords) doc.text(c.sym, x + c.x, y)
              y += plan.chordSizePt + lineGap / 2
            }
            doc.setFont(lFam, 'normal'); doc.setFontSize(plan.lyricSizePt)
            doc.text(b.lyrics, x, y)
            y += plan.lyricSizePt + lineGap
          }
        }
      }
    })
  })
}

/* -----------------------------------------------------------
 * Exposed helpers
 * --------------------------------------------------------- */
export { planSongLayout, chooseBestLayout, normalizeSongInput } from './pdfLayout'

export async function chooseBestLayoutAuto(song, baseOpt = {}) {
  const doc = await newPDF()
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const o = {
    lyricFamily: fams.lyricFamily || baseOpt.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || baseOpt.chordFamily || 'Courier',
    ...baseOpt,
  }
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const fallbackMeasure = (pt) => (text) => (text ? text.length * (pt * 0.6) : 0)
  const makeLyric = (pt) => (text) => {
    try {
      doc.setFont(o.lyricFamily, 'normal')
      doc.setFontSize(pt)
      return doc.getTextWidth(text || '')
    } catch {
      return fallbackMeasure(pt)(text)
    }
  }
  const makeChord = (pt) => (text) => {
    try {
      doc.setFont(o.chordFamily, 'bold')
      doc.setFontSize(pt)
      return doc.getTextWidth(text || '')
    } catch {
      return fallbackMeasure(pt)(text)
    }
  }
  const norm = normalizeSongInput(song)
  return chooseBestLayout(norm, { ...o, pageWidth: pageW, pageHeight: pageH }, makeLyric, makeChord)
}

/* -----------------------------------------------------------
 * Single-song PDF
 * --------------------------------------------------------- */
export async function downloadSingleSongPdf(song, options) {
  const doc = await newPDF()
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const base = {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier',
    columns: options?.columns === 2 ? 2 : 1,
    showCapo: options?.showCapo,
  }
  const norm = normalizeSongInput(song)
  const planResult = planWithDoc(doc, norm, base)
  const plan = (planResult && planResult.plan) ? planResult.plan : planResult
  const title = song.title || norm.title || 'Untitled'
  const key = song.key || norm.key || 'C'
  drawPlannedSong(doc, plan, { title, key, capo: norm.meta?.capo, showCapo: options?.showCapo !== false })
  doc.setProperties({ title: `${title} – GraceChords` })
  doc.save(`${title.replace(/\s+/g, '_')}.pdf`)
  return { plan }
}

/* -----------------------------------------------------------
 * Multi-song PDF (setlists / songbooks)
 * --------------------------------------------------------- */
export async function downloadMultiSongPdf(songs, options = {}) {
  const doc = await newPDF()
  let fams = {}
  try { fams = await ensureFontsEmbedded(doc) } catch {}
  const baseOpt = {
    lyricSizePt: Math.max(12, options?.lyricSizePt || 16),
    chordSizePt: Math.max(12, options?.chordSizePt || 16),
    margin: 36,
    lyricFamily: fams.lyricFamily || 'Helvetica',
    chordFamily: fams.chordFamily || 'Courier',
    columns: options?.columns === 2 ? 2 : 1,
    showCapo: options?.showCapo,
  }
  const includeTOC = !!options?.includeTOC
  const cover = options?.coverImageDataUrl

  const planned = songs.map((s, idx) => {
    const norm = normalizeSongInput(s)
    const planResult = planWithDoc(doc, norm, baseOpt)
    const plan = (planResult && planResult.plan) ? planResult.plan : planResult
    const title = s.title || norm.title || 'Untitled'
    const key = s.key || norm.key || 'C'
    const capo = norm.meta?.capo
    return {
      raw: s,
      plan,
      title,
      key,
      capo,
      num: s._songbookNum || idx + 1,
      origTitle: s._origTitle || title,
    }
  })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = baseOpt.margin
  const lineH = 16
  const linesPerPage = Math.floor((pageH - margin * 2 - 40) / lineH)
  const tocPages = includeTOC ? Math.ceil(planned.length / linesPerPage) : 0
  let curPage = 1 + (cover ? 1 : 0) + tocPages
  const tocEntries = planned.map((p) => {
    const entry = { num: p.num, title: p.origTitle, page: curPage }
    curPage += p.plan.layout.pages.length
    return entry
  })

  // Cover page
  if (cover) {
    try { doc.addImage(cover, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST') } catch {}
    if (includeTOC || planned.length) doc.addPage()
  }

  // Table of contents
  if (includeTOC) {
    doc.setFont(baseOpt.lyricFamily, 'bold'); doc.setFontSize(24)
    doc.text('Table of Contents', pageW / 2, margin + 20, { align: 'center' })
    doc.setFont(baseOpt.lyricFamily, 'normal'); doc.setFontSize(12)
    let y = margin + 40
    tocEntries.forEach((e, i) => {
      if (i > 0 && i % linesPerPage === 0) { doc.addPage(); y = margin }
      const leftText = `${e.num} ${e.title}`
      doc.text(leftText, margin, y)
      const pageStr = String(e.page)
      const right = pageW - margin
      const textW = doc.getTextWidth(leftText)
      const pageWdt = doc.getTextWidth(pageStr)
      const dotsW = right - margin - textW - pageWdt - 4
      if (dotsW > 0) {
        const dot = doc.getTextWidth('.')
        const dots = '.'.repeat(Math.max(0, Math.floor(dotsW / dot)))
        doc.text(dots, margin + textW + 2, y)
      }
      doc.text(pageStr, right, y, { align: 'right' })
      y += lineH
    })
    if (planned.length) doc.addPage()
  }

  // Songs
  planned.forEach((p, idx) => {
    if (idx > 0) doc.addPage()
    drawPlannedSong(doc, p.plan, { title: p.title, key: p.key, capo: p.capo, showCapo: options?.showCapo !== false })
  })

  doc.setProperties({ title: options?.docTitle || 'GraceChords Setlist' })
  doc.save(options?.fileName || 'GraceChords_Selection.pdf')
}

/* -----------------------------------------------------------
 * Songbook wrapper
 * --------------------------------------------------------- */
export async function downloadSongbookPdf(songs, { includeTOC, coverImageDataUrl } = {}) {
  const numbered = songs.map((s, i) => ({
    ...s,
    title: `${i + 1}. ${s.title}`,
    _songbookNum: i + 1,
    _origTitle: s.title,
  }))
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  await downloadMultiSongPdf(numbered, {
    includeTOC,
    coverImageDataUrl,
    docTitle: 'GraceChords Songbook',
    fileName: `songbook-${date}.pdf`,
  })
}


// Ensure we pass lyric/chord family & pt to measure
export function measureSection(section, pt, families = { lyrics: 'Noto Sans', chords: 'Noto Sans Mono', chordWeight: 'bold' }) {
  return _measureSection(section, {
    fontSize: pt,
    lyricFamily: families.lyrics,
    chordFamily: families.chords,
    chordWeight: families.chordWeight || 'bold',
  });
}

