// Minimal ChordPro parser with inline chord positions
export function parseChordPro(text){
  const lines = text.replace(/\r\n/g,'\n').split('\n')
  const meta = {}
  const blocks = []
  let current = { section:'', lines:[] }
  const metaRe = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/
  for(const raw of lines){
    const m = raw.match(metaRe)
    if(m){ meta[m[1].trim().toLowerCase()] = m[2].trim(); continue }
    if(raw.trim()===''){ if(current.lines.length) blocks.push(current); current={section:'',lines:[]}; continue }
    const secMatch = raw.match(/^\s*(?:##?\s*|\[)([^#\]]+?)(?:\])?\s*$/)
    if(secMatch && !raw.includes('[')){ if(current.lines.length) blocks.push(current); current={section:secMatch[1].trim(),lines:[]}; continue }
    const { plain, chords } = extractChords(raw)
    current.lines.push({ text: plain, chords })
  }
  if(current.lines.length) blocks.push(current)
  return { meta, blocks }
}

export function extractChords(line){
  let plain=''; const chords=[]; let i=0
  while(i<line.length){
    if(line[i]==='['){
      const j=line.indexOf(']', i+1)
      if(j!==-1){
        const sym=line.slice(i+1,j).trim()
        chords.push({ sym, index: plain.length })
        i=j+1; continue
      }
    }
    plain+=line[i]; i++
  }
  return { plain, chords }
}

export function makeMonospaceChordLine(plain, chordPositions){
  if(!chordPositions?.length) return ''
  let out=''; let cursor=0
  for(const c of chordPositions){
    const pad=Math.max(0, c.index - cursor)
    out += ' '.repeat(pad) + c.sym
    cursor = c.index + c.sym.length
  }
  return out
}
