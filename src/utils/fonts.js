// Runtime font embedding for jsPDF
// Drop your TTF files into /public/fonts and update the names below.
import { jsPDF } from 'jspdf'

// Map desired font faces -> { url, vfsName, postScriptName }
const DEFAULT_FONTS = {
  lyricRegular: { url: `${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`, vfsName: 'NotoSans-Regular.ttf', post: 'NotoSans' },
  lyricBold:    { url: `${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`,    vfsName: 'NotoSans-Bold.ttf',    post: 'NotoSans-Bold' },
  chordBoldMono:{ url: `${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`, vfsName: 'NotoSansMono-Bold.ttf',post: 'NotoSansMono-Bold' },
}

export async function ensureFontsEmbedded(doc, custom = {}){
  const map = { ...DEFAULT_FONTS, ...custom }
  // load each font file and register into VFS if not already present
  for(const key of Object.keys(map)){
    const { url, vfsName, post } = map[key]
    if(!url) continue
    // Skip if already present
    const vfs = doc.getFontList && doc.getFontList()
    // jsPDF doesn't expose VFS directly; we attempt to add unconditionally
    const data = await fetchAsBase64(url)
    doc.addFileToVFS(vfsName, data)
    // Guess style: bold if name contains Bold, otherwise normal
    const style = /Bold/i.test(post) ? 'bold' : 'normal'
    doc.addFont(vfsName, post, style)
  }
  return {
    lyricFamily: (map.lyricRegular?.post) || 'Helvetica',
    lyricBoldFamily: (map.lyricBold?.post) || 'Helvetica',
    chordBoldFamily: (map.chordBoldMono?.post) || 'Courier'
  }
}

async function fetchAsBase64(url){
  const res = await fetch(url)
  const blob = await res.blob()
  return await blobToBase64(blob)
}

function blobToBase64(blob){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1]) // strip data: header
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
