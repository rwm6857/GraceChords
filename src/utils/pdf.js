import { jsPDF } from 'jspdf'
import { ensureFontsEmbedded } from './fonts'

function drawSongIntoDoc(doc, song, opt){
  const lFam = String(opt.lyricFamily || 'Helvetica')
  const cFam = String(opt.chordFamily || 'Courier')
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight()
  const margin = opt.margin ?? 36, contentW = pageW - margin*2, gutter = 18
  let x = margin, y = margin + 54
  const colW = opt.columns===2 ? (contentW - gutter)/2 : contentW

  // Header
  doc.setFont(lFam,'bold'); doc.setFontSize(Math.max(22, opt.lyricSizePt + 6))
  doc.text(opt.title || song.title, x, margin + 24)
  doc.setFont(lFam,'italic'); doc.setFontSize(Math.max(12, opt.lyricSizePt - 2))
  doc.text(`Key: ${opt.key || song.key || '—'}`, x, margin + 40)

  const lineGap = 4
  const sectionSize = Math.max(opt.lyricSizePt + 2, 16) // larger than lyrics

  function widthOf(text){ return doc.getTextWidth(text || '') }
  function nextColumnOrPage(){
    if(opt.columns===2 && x===margin){ x = margin + colW + gutter; y = margin + 54 }
    else { doc.addPage(); x = margin; y = margin + 54 }
  }
  function sectionHeight(block){
    let h=0; if(block.section) h += (sectionSize + 4)
    for(const ln of block.lines){
      if(ln.chordPositions?.length) h += opt.chordSizePt + lineGap/2
      h += opt.lyricSizePt + lineGap
    }
    return h + 4
  }
  function drawLine(plain, chordPositions){
  // 1) Measure offsets with the LYRICS font/size
  doc.setFont(lFam, 'normal')
  doc.setFontSize(opt.lyricSizePt)
  const offsets = (chordPositions || []).map(c => ({
    sym: c.sym,
    x: x + doc.getTextWidth(plain.slice(0, c.index))
  }))

  // 2) Draw chords with the CHORD font/size, using the measured offsets
  if(offsets.length){
    doc.setFont(cFam, 'bold')
    doc.setFontSize(opt.chordSizePt)
    for(const c of offsets){
      doc.text(c.sym, c.x, y)
    }
    // vertical gap between chord line and lyric line
    y += opt.chordSizePt + lineGap/2
  }

  // 3) Draw the lyric line
  doc.setFont(lFam, 'normal')
  doc.setFontSize(opt.lyricSizePt)
  doc.text(plain, x, y)
  y += opt.lyricSizePt + lineGap
}


  for(const block of song.lyricsBlocks){
    const need = sectionHeight(block)
    if(y + need > pageH - margin) nextColumnOrPage()
    if(block.section){
      doc.setFont(lFam,'bold'); doc.setFontSize(sectionSize)
      doc.text(`[${String(block.section).toUpperCase()}]`, x, y)
      y += sectionSize + 4
    }
    for(const ln of block.lines){
      drawLine(ln.plain || ln.text || '', ln.chordPositions || [])
    }
    y += 4
  }
}

export async function songToPdfDoc(song, options){
  const doc = new jsPDF({ unit:'pt', format:'letter' })
  const opt = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: options?.columns || 1,
    title: options?.title || song.title,
    key: options?.key || song.key,
    margin: 36,
    lyricFamily: 'Helvetica',
    chordFamily: 'Courier'
  }
  try{ const f = await ensureFontsEmbedded(doc); opt.lyricFamily = f.lyricFamily || opt.lyricFamily; opt.chordFamily = f.chordFamily || opt.chordFamily }catch{}
  drawSongIntoDoc(doc, song, opt)
  return doc
}

export async function downloadSingleSongPdf(song, options){
  const d1 = await songToPdfDoc(song, { ...options, columns: 1 })
  if(d1.internal.getNumberOfPages() > 1){
    const d2 = await songToPdfDoc(song, { ...options, columns: 2 })
    d2.save(`${song.title.replace(/\s+/g,'_')}.pdf`)
  } else {
    d1.save(`${song.title.replace(/\s+/g,'_')}.pdf`)
  }
}

export async function downloadMultiSongPdf(songs, options){
  const doc = new jsPDF({ unit:'pt', format:'letter' })
  const f = await ensureFontsEmbedded(doc)
  const baseOpt = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: 1,
    margin: 36,
    lyricFamily: f.lyricFamily || 'Helvetica',
    chordFamily: f.chordFamily || 'Courier'
  }
  let first = true
  for(const s of songs){
    if(!first) doc.addPage()
    first = false
    drawSongIntoDoc(doc, { title: s.title, key: s.key, lyricsBlocks: s.lyricsBlocks }, { ...baseOpt, title: s.title, key: s.key })
  }
  doc.save('GraceChords_Selection.pdf')
}
