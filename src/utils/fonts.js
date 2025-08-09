export async function ensureFontsEmbedded(doc){
  const base = import.meta.env.BASE_URL || '/'
  const urls = {
    'NotoSans-Regular.ttf': base + 'fonts/NotoSans-Regular.ttf',
    'NotoSans-Bold.ttf': base + 'fonts/NotoSans-Bold.ttf',
    'NotoSans-Italic.ttf': base + 'fonts/NotoSans-Italic.ttf',
    'NotoSans-BoldItalic.ttf': base + 'fonts/NotoSans-BoldItalic.ttf',
    'NotoSansMono-Regular.ttf': base + 'fonts/NotoSansMono-Regular.ttf',
    'NotoSansMono-Bold.ttf': base + 'fonts/NotoSansMono-Bold.ttf',
  }
  try {
    const b64 = await Promise.all(Object.values(urls).map(fetchAsBase64))
    const names = Object.keys(urls)
    for(let i=0;i<names.length;i++){ doc.addFileToVFS(names[i], b64[i]) }
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
    doc.addFont('NotoSans-Italic.ttf', 'NotoSans', 'italic')
    doc.addFont('NotoSans-BoldItalic.ttf', 'NotoSans', 'bolditalic')
    doc.addFont('NotoSansMono-Regular.ttf', 'NotoSansMono', 'normal')
    doc.addFont('NotoSansMono-Bold.ttf', 'NotoSansMono', 'bold')
    return { lyricFamily:'NotoSans', chordFamily:'NotoSansMono' }
  } catch (e) {
    console.warn('Falling back to core fonts; put Noto files in /public/fonts', e)
    return { lyricFamily:'Helvetica', chordFamily:'Courier' }
  }
}
async function fetchAsBase64(url){ const res=await fetch(url); if(!res.ok) throw new Error('Font fetch '+url); const blob=await res.blob(); return await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result.split(',')[1]); r.onerror=reject; r.readAsDataURL(blob) }) }
