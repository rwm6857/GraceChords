import { jsPDF } from 'jspdf'
import { ensureFontsEmbedded } from './fonts'

function estimateOnePage(song, opt){
  const lines = song.lyricsBlocks.reduce((n,b)=> n + b.lines.length, 0)
  const perLine = (opt.chordSizePt + opt.lyricSizePt) * 1.35
  const header = 64, margin = opt.margin || 36, pageH = 792
  return header + lines*perLine + margin < pageH - margin*2
}

function drawSongIntoDoc(doc, song, opt){
  const lFam = String(opt.lyricFamily || 'Helvetica')
  const cFam = String(opt.chordFamily || 'Courier')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = opt.margin ?? 36
  const contentW = pageW - margin*2
  const gutter = 18
  const columnCount = opt.columns === 'auto' ? (estimateOnePage(song,opt) ? 1 : 2) : Number(opt.columns || 1)
  const colW = columnCount === 2 ? (contentW - gutter)/2 : contentW

  doc.setFont(lFam,'bold'); doc.setFontSize(18)
  doc.text(opt.title || song.title, margin, margin)
  doc.setFont(lFam,'normal'); doc.setFontSize(11)
  const sub = `Key: ${opt.key || song.key || '—'}${opt.tags ? '  •  ' + opt.tags : ''}`
  doc.text(sub, margin, margin+16)

  function footer(){
    const pageNum = doc.internal.getNumberOfPages()
    doc.setFont(lFam,'normal'); doc.setFontSize(10)
    doc.text(String(pageNum), pageW/2, pageH-16, { align: 'center' })
  }

  let x = margin, y = margin + 36; footer()
  const lineGap = 4

  function wrapText(text, maxWidth){
    if(!text) return ['']
    const words = String(text).split(/\s+/), lines=[]; let line=''
    for(const w of words){
      const t = (line? line+' ' : '') + w
      if(doc.getTextWidth(t) <= maxWidth){ line = t } else { if(line) lines.push(line); line = w }
    }
    if(line) lines.push(line); return lines
  }

  function ensureSpace(h){
    if(y + h <= pageH - margin) return
    if(columnCount===2 && x===margin){ x = margin + colW + gutter; y = margin + 36 }
    else { doc.addPage(); x = margin; y = margin + 36; footer() }
  }

  function drawPair(chords, lyric){
    if(chords && chords.trim()){
      doc.setFont(cFam,'bold'); doc.setFontSize(opt.chordSizePt)
      for(const ln of wrapText(chords, colW)){ doc.text(ln, x, y); y += opt.chordSizePt + lineGap/2 }
    }
    doc.setFont(lFam,'normal'); doc.setFontSize(opt.lyricSizePt)
    for(const ln of wrapText(lyric, colW)){ doc.text(ln, x, y); y += opt.lyricSizePt + lineGap }
  }

  function drawPairPositioned(plain, chordPositions){
    if(chordPositions?.length){
      doc.setFont(cFam,'bold'); doc.setFontSize(opt.chordSizePt)
      for(const c of chordPositions){
        const xOffset = doc.getTextWidth(plain.slice(0, c.index))
        doc.text(c.sym, x + xOffset, y)
      }
      y += opt.chordSizePt + lineGap/2
    }
    doc.setFont(lFam,'normal'); doc.setFontSize(opt.lyricSizePt)
    doc.text(plain, x, y); y += opt.lyricSizePt + lineGap
  }

  for(const block of song.lyricsBlocks){
    const sec = (block.section || '').trim()
    if(sec){ doc.setFont(lFam,'bold'); doc.setFontSize(12); ensureSpace(22); doc.text(sec, x, y); y += 14 }
    for(const ln of block.lines){
      const approx = opt.chordSizePt + opt.lyricSizePt + 2*lineGap + 4
      ensureSpace(approx)
      if(Array.isArray(ln.chordPositions)){ drawPairPositioned(ln.plain || ln.text || '', ln.chordPositions) }
      else { drawPair(ln.chords || '', ln.text || '') }
    }
    y += 4
  }
}

export async function songToPdfDoc(song, options){
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const opt = {
    lyricSizePt: Math.max(14, options?.lyricSizePt || 16),
    chordSizePt: Math.max(14, options?.chordSizePt || 16),
    columns: options?.columns || 'auto',
    title: options?.title || song.title,
    key: options?.key || song.key,
    tags: options?.tags || (song.tags || []).join(', '),
    margin: 36,
    lyricFamily: 'Helvetica',
    chordFamily: 'Courier',
  }
  try {
    const f = await ensureFontsEmbedded(doc)
    opt.lyricFamily = options?.lyricFont || f.lyricFamily || 'Helvetica'
    opt.chordFamily = options?.chordFont || f.chordFamily || 'Courier'
  } catch {}
  drawSongIntoDoc(doc, song, opt)
  return doc
}

export async function downloadSingleSongPdf(song, options){
  const doc = await songToPdfDoc(song, options || {})
  doc.save(`${song.title.replace(/\s+/g,'_')}.pdf`)
}
