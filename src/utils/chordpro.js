export function parseChordPro(text){
  const lines = text.replace(/\r\n/g,'\n').split('\n'); const meta={}; const blocks=[]; let current={section:'',lines:[]}
  const metaRe=/^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/
  for(const raw of lines){
    if (/^\s*#/.test(raw)) { continue } // ignore ChordPro comment lines starting with '#'
    const m=raw.match(metaRe); if(m){ meta[m[1].trim().toLowerCase()] = m[2].trim(); continue }
    if(raw.trim()===''){ if(current.lines.length) blocks.push(current); current={section:'',lines:[]}; continue }
    const secMatch=raw.match(/^\s*(?:##?\s*|\[)([^#\]]+?)(?:\])?\s*$/);
    if(secMatch){
      const tag=secMatch[1].trim();
      const bracketOnly=/^\s*\[[^\]]+\]\s*$/.test(raw);
      const chordLike=/^[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-G][#b]?)?$/i.test(tag);
        if(!raw.includes('[') || (bracketOnly && !chordLike)){
          // Treat lines like [VERSE] as section headers rather than chords
          if(current.lines.length) blocks.push(current); current={section:tag,lines:[]}; continue
        }
    }
    const { plain, chords } = extractChords(raw); current.lines.push({ text: plain, chords })
  } if(current.lines.length) blocks.push(current); return { meta, blocks }
}
export function extractChords(line){ let plain=''; const chords=[]; let i=0; while(i<line.length){ if(line[i]==='['){ const j=line.indexOf(']', i+1); if(j!==-1){ const sym=line.slice(i+1,j).trim(); chords.push({ sym, index: plain.length }); i=j+1; continue } } plain+=line[i]; i++ } return { plain, chords } }
export function makeMonospaceChordLine(plain, chordPositions){ if(!chordPositions?.length) return ''; let out=''; let cursor=0; for(const c of chordPositions){ const pad=Math.max(0, c.index - cursor); out += ' '.repeat(pad) + c.sym; cursor = c.index + c.sym.length } return out }
export const KEYS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']; const FLAT={'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'}; function norm(n){ return FLAT[n] || n }

// Extract normalized root (sharp-preference) from a key/chord string.
// Examples: 'Em' -> 'E', 'C#m' -> 'C#', 'Bb' -> 'A#'
export function keyRoot(key){
  if (!key) return ''
  const m = String(key).match(/^\s*([A-G][#b]?)/)
  if (!m) return ''
  return norm(m[1])
}

export function stepsBetween(fromKey, toKey){
  if(!fromKey||!toKey) return 0
  const aRoot = keyRoot(fromKey)
  const bRoot = keyRoot(toKey)
  const a=KEYS.indexOf(aRoot); const b=KEYS.indexOf(bRoot)
  if(a===-1||b===-1) return 0
  return (b-a+12)%12
}

export function transposeSym(sym, steps){
  if(sym.includes('/')){ const [r,b]=sym.split('/'); return transposeSym(r,steps)+'/'+transposeSym(b,steps) }
  const m=sym.match(/^([A-G][#b]?)(.*)$/); if(!m) return sym
  const i=KEYS.indexOf(norm(m[1])); if(i===-1) return sym
  return KEYS[(i+steps+12)%12] + (m[2]||'')
}
