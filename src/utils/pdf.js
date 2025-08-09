import { jsPDF } from 'jspdf'
import { ensureFontsEmbedded } from './fonts'
import { transposeChordLine } from './transpose'

// Internal painter that draws a single song onto an existing jsPDF instance.
function drawSongIntoDoc(doc, song, options){
  const opt = {
    lyricFont: options.lyricFont || 'Arial',
    chordFont: options.chordFont || 'Courier',
    lyricSizePt: Math.max(14, options.lyricSizePt || 16),
    chordSizePt: Math.max(14, options.chordSizePt || 16),
    columns: options.columns || 'auto',
    title: options.title || song.title,
    key: options.key || song.key,
    tags: options.tags || (song.tags || []).join(', '),
    margin: 36
  }

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - opt.margin*2
  const gutter = 18
  const autoCols = (opt.columns === 'auto')
  const columnCount = autoCols ? (estimateOnePage(song, opt) ? 1 : 2) : Number(opt.columns)
  const colW = columnCount === 2 ? (contentW - gutter)/2 : contentW

  // header
  doc.setFont(lyricFamily,'bold')
  doc.setFontSize(18)
  doc.text(opt.title, opt.margin, opt.margin)
  doc.setFont(lyricFamily,'normal')
  doc.setFontSize(11)
  const sub = `Key: ${opt.key || '—'}${opt.tags ? '  •  ' + opt.tags : ''}`
  doc.text(sub, opt.margin, opt.margin + 16)

  // footer helper
  function footer(){
    const pageNum = doc.internal.getNumberOfPages()
    doc.setFont(lyricFamily,'normal')
    doc.setFontSize(10)
    doc.text(String(pageNum), pageW/2, pageH - 16, { align: 'center' })
  }

  // layout state
  let x = opt.margin
  let y = opt.margin + 36

  const lineGap = 4
  function wrapText(text, maxWidth){
    if(!text) return ['']
    const words = String(text).split(/\s+/)
    const lines = []
    let line = ''
    for(const w of words){
      const test = (line? line + ' ' : '') + w
      const width = doc.getTextWidth(test)
      if(width <= maxWidth){
        line = test
      } else {
        if(line) lines.push(line)
        line = w
      }
    }
    if(line) lines.push(line)
    return lines
  }

  function ensureSpace(neededHeight){
    if(y + neededHeight <= pageH - opt.margin) return
    // next column or next page
    if(columnCount === 2 && x === opt.margin){
      x = opt.margin + colW + gutter
      y = opt.margin + 36
    } else {
      doc.addPage()
      // reset footer on new page
      x = opt.margin
      y = opt.margin + 36
    }
    footer()
  }

  function drawChordLyricPair(chords, lyric){
    if(chords && chords.trim()){
      doc.setFont(chordFamily, 'bold')
      doc.setFontSize(opt.chordSizePt)
      const lines = wrapText(chords, colW)
      lines.forEach((ln)=>{
        doc.text(ln, x, y)
        y += opt.chordSizePt + lineGap/2
      })
    }
    doc.setFont(lyricFamily, 'normal')
    doc.setFontSize(opt.lyricSizePt)
    const linesL = wrapText(lyric, colW)
    linesL.forEach((ln)=>{
      doc.text(ln, x, y)
      y += opt.lyricSizePt + lineGap
    })
  }

  // body
  song.lyricsBlocks.forEach((block)=>{
    const sec = (block.section || '').trim()
    if(sec){
      doc.setFont(lyricFamily,'bold')
      doc.setFontSize(12)
      ensureSpace(14 + 8)
      doc.text(sec, x, y)
      y += 14
    }
    block.lines.forEach((ln)=>{
      const approxHeight = (opt.chordSizePt + opt.lyricSizePt) + 2*lineGap + 4
      ensureSpace(approxHeight)
      drawChordLyricPair(ln.chords || '', ln.text || '')
    })
    y += 4
  })

  footer()
}

// heuristic to decide if one page/column fits
function estimateOnePage(song, opt){
  const lines = song.lyricsBlocks.reduce((n,b)=> n + b.lines.length, 0)
  const perLine = (opt.chordSizePt + opt.lyricSizePt) * 1.35
  const header = 64
  const margin = opt.margin || 36
  const pageH = 792 // pt
  const total = header + lines*perLine + margin
  return total < (pageH - margin*2)
}

export async function songToPdfDoc(song, options){
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const families = await ensureFontsEmbedded(doc)
  const lyricFamily = options.lyricFont || families.lyricFamily || 'Helvetica'
  const chordFamily = options.chordFont || families.chordBoldFamily || 'Courier'

  drawSongIntoDoc(doc, song, options || {})
  return doc
}

export async function downloadSingleSongPdf(song, options){
  const doc = await songToPdfDoc(song, options || {})
  doc.save(`${song.title.replace(/\s+/g,'_')}.pdf`)
}

// Build a multi-song PDF with vector text, one song per page set (new page between songs).
export async function downloadMultiSongPdf(songs, options){
  if(!songs || !songs.length) return
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const families = await ensureFontsEmbedded(doc)
  const lyricFamily = options.lyricFont || families.lyricFamily || 'Helvetica'
  const chordFamily = options.chordFont || families.chordBoldFamily || 'Courier'

  songs.forEach((song, idx)=>{
    if(idx > 0) doc.addPage()
    drawSongIntoDoc(doc, song, options || {})
  })
  doc.save('Songbook_Selection.pdf')
}
