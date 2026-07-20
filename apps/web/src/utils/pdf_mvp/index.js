// Browser shim around ./pure.js. Public exports keep their existing
// signatures so SongViewPage / SetlistPage / songbook callers continue to
// work without modification. The DOM-free renderer lives in pure.js so the
// bot Worker can reuse it.
//
// Decision ladder, sectionising, and layout math live in pure.js.

import { registerPdfFonts } from './fonts.js'
import {
  renderSingleSongPdfDoc,
  renderMultiSongPdfDoc,
  renderSongbookPdfDoc,
  planSingleSong as planSingleSongPure,
  __test as __testPure,
} from './pure.js'

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
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const subtitle = `${mm}.${dd}.${d.getFullYear()}`
  const res = await renderSongbookPdfDoc(songs, {
    includeTOC,
    coverImageDataUrl,
    title: 'GraceChords Songbook',
    subtitle,
    registerFonts: registerPdfFonts,
  })
  if (!res) return
  const blob = res.doc.output('blob')
  triggerDownload(blob, `songbook-${new Date().toISOString().slice(0,10)}.pdf`)
}

export const planSingleSong = planSingleSongPure
export const __test = __testPure
