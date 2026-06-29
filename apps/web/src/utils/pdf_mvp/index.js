// Browser shim around ./pure.js. Public exports keep their existing
// signatures so SongViewPage / SetlistPage / songbook callers continue to
// work without modification. The DOM-free renderer lives in pure.js so the
// bot Worker can reuse it.
//
// Decision ladder, sectionising, and layout math live in pure.js.

import { applyFooterToAllPages } from './footer'
import { registerPdfFonts } from './fonts.js'
import {
  createDoc,
  renderSingleSongPdfDoc,
  renderMultiSongPdfDoc,
  planSingleSong as planSingleSongPure,
  __internal,
  __test as __testPure,
} from './pure.js'

const { PAGE, MARGINS, TITLE_PT, SUBTITLE_PT, sectionify, planForSong, renderPlanned, drawTextSafe } = __internal

function triggerDownload(blob, filename){
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function bufferToBlob(buffer){
  return new Blob([buffer], { type: 'application/pdf' })
}

function sanitizeFilename(name){
  return String(name || 'song').replace(/[\\/:*?"<>|]+/g, '_')
}

export async function downloadSingleSongPdf(song){
  const { doc, plan } = await renderSingleSongPdfDoc(song, { registerFonts: registerPdfFonts })
  const blob = doc.output('blob')
  triggerDownload(blob, `${sanitizeFilename(song?.title)}.pdf`)
  return { plan }
}

export async function downloadMultiSongPdf(songs = []){
  if (!Array.isArray(songs) || songs.length === 0) return
  const res = await renderMultiSongPdfDoc(songs, { registerFonts: registerPdfFonts })
  if (!res) return
  const blob = res.doc.output('blob')
  triggerDownload(blob, `setlist-${new Date().toISOString().slice(0,10)}.pdf`)
}

export async function downloadSongbookPdf(songs = [], { includeTOC = true, coverImageDataUrl = null } = {}){
  if (!Array.isArray(songs) || songs.length === 0) return
  const doc = createDoc()
  await registerPdfFonts(doc)
  try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
  try { doc.setTextColor(0,0,0) } catch {}

  const pre = []
  for (const s of songs){
    const plan = planForSong(doc, s)
    pre.push({ song: s, plan, sections: sectionify(s) })
  }

  let pageNo = 1
  if (coverImageDataUrl){
    try {
      const availW = PAGE.w - MARGINS.left - MARGINS.right
      const availH = PAGE.h - MARGINS.top - MARGINS.bottom
      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = coverImageDataUrl
      })
      const scale = Math.min(availW / img.width, availH / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = MARGINS.left + (availW - w) / 2
      const y = MARGINS.top + (availH - h) / 2
      doc.addImage(coverImageDataUrl, undefined, x, y, w, h, undefined, 'FAST')
    } catch {
      try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
      doc.setFontSize(TITLE_PT)
      try { doc.text('GraceChords Songbook', PAGE.w/2, PAGE.h/2 - 10, { align: 'center', baseline: 'middle' }) } catch {}
      try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
      doc.setFontSize(SUBTITLE_PT)
      try { doc.setTextColor(90,90,90) } catch {}
      const d1 = new Date();
      const mm1 = String(d1.getMonth() + 1).padStart(2, '0');
      const dd1 = String(d1.getDate()).padStart(2, '0');
      const yyyy1 = d1.getFullYear();
      const dateStr1 = `${mm1}.${dd1}.${yyyy1}`
      try { doc.text(dateStr1, PAGE.w/2, PAGE.h/2 + 14, { align: 'center', baseline: 'middle' }) } catch {}
      try { doc.setTextColor(0,0,0) } catch {}
    }
    pageNo++
  } else {
    try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
    doc.setFontSize(TITLE_PT)
    try { doc.text('GraceChords Songbook', PAGE.w/2, PAGE.h/2 - 10, { align: 'center', baseline: 'middle' }) } catch {}
    try { doc.setFont('NotoSans', 'italic') } catch { try { doc.setFont('helvetica', 'italic') } catch {} }
    doc.setFontSize(SUBTITLE_PT)
    try { doc.setTextColor(90,90,90) } catch {}
    const d2 = new Date();
    const mm2 = String(d2.getMonth() + 1).padStart(2, '0');
    const dd2 = String(d2.getDate()).padStart(2, '0');
    const yyyy2 = d2.getFullYear();
    const dateStr2 = `${mm2}.${dd2}.${yyyy2}`
    try { doc.text(dateStr2, PAGE.w/2, PAGE.h/2 + 14, { align: 'center', baseline: 'middle' }) } catch {}
    try { doc.setTextColor(0,0,0) } catch {}
    pageNo++
  }

  const entries = pre.length
  const lineH = 16
  const yStartFirst = MARGINS.top + 24
  const rowsPerColFirst = Math.max(1, Math.floor((PAGE.h - MARGINS.bottom - yStartFirst) / lineH))
  const rowsPerColNext  = Math.max(1, Math.floor((PAGE.h - MARGINS.bottom - MARGINS.top) / lineH))

  let tocPages = 0
  if (includeTOC) {
    if (entries <= rowsPerColFirst) tocPages = 1
    else if (entries <= 2 * rowsPerColFirst) tocPages = 1
    else {
      const remaining = Math.max(0, entries - 2 * rowsPerColFirst)
      const extraPages = Math.ceil(remaining / (2 * rowsPerColNext))
      tocPages = 1 + extraPages
    }
  }

  if (includeTOC){
    const leftX = MARGINS.left
    const rightX = PAGE.w / 2 + 10

    doc.addPage([PAGE.w, PAGE.h])
    try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
    doc.setFontSize(18)
    drawTextSafe(doc, 'Table of Contents', MARGINS.left, MARGINS.top)
    try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
    doc.setFontSize(11)

    let idx = 0
    if (entries <= rowsPerColFirst) {
      let y = yStartFirst
      while (idx < entries && y <= PAGE.h - MARGINS.bottom - lineH) {
        const title = String(pre[idx].song?.title || 'Untitled')
        drawTextSafe(doc, `${idx+1}. ${title}`, leftX, y)
        y += lineH
        idx++
      }
    } else {
      let yL = yStartFirst, yR = yStartFirst
      for (let c = 0; c < rowsPerColFirst && idx < entries; c++, idx++) {
        const title = String(pre[idx].song?.title || 'Untitled')
        drawTextSafe(doc, `${idx+1}. ${title}`, leftX, yL)
        yL += lineH
      }
      for (let c = 0; c < rowsPerColFirst && idx < entries; c++, idx++) {
        const title = String(pre[idx].song?.title || 'Untitled')
        drawTextSafe(doc, `${idx+1}. ${title}`, rightX, yR)
        yR += lineH
      }

      while (idx < entries) {
        doc.addPage([PAGE.w, PAGE.h])
        try { doc.setFont('NotoSans', 'bold') } catch { try { doc.setFont('helvetica', 'bold') } catch {} }
        doc.setFontSize(18)
        drawTextSafe(doc, 'Table of Contents (continued)', MARGINS.left, MARGINS.top)
        try { doc.setFont('NotoSans', 'normal') } catch { try { doc.setFont('helvetica', 'normal') } catch {} }
        doc.setFontSize(11)
        let yL2 = MARGINS.top + 24, yR2 = MARGINS.top + 24
        for (let c = 0; c < rowsPerColNext && idx < entries; c++, idx++) {
          const title = String(pre[idx].song?.title || 'Untitled')
          drawTextSafe(doc, `${idx+1}. ${title}`, leftX, yL2)
          yL2 += lineH
        }
        for (let c = 0; c < rowsPerColNext && idx < entries; c++, idx++) {
          const title = String(pre[idx].song?.title || 'Untitled')
          drawTextSafe(doc, `${idx+1}. ${title}`, rightX, yR2)
          yR2 += lineH
        }
      }
    }
  }

  for (let i = 0; i < pre.length; i++){
    doc.addPage([PAGE.w, PAGE.h])
    const numbered = { ...pre[i].song, title: `${i+1}. ${pre[i].song?.title || 'Untitled'}` }
    renderPlanned(doc, pre[i].plan, pre[i].sections, numbered)
  }
  const prePages = 1 + (includeTOC ? tocPages : 0)
  applyFooterToAllPages(doc, { left: MARGINS.left, bottom: MARGINS.bottom }, { w: PAGE.w, h: PAGE.h }, { startPage: prePages + 1 })
  const blob = doc.output('blob')
  triggerDownload(blob, `songbook-${new Date().toISOString().slice(0,10)}.pdf`)
}

export const planSingleSong = planSingleSongPure
export const __test = __testPure
