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

export function transposeSym(sym, steps, preferFlat = false){
  // Legacy/simple behavior with a default preference; does not preserve original accidental.
  if (steps === 0) return sym
  if(sym.includes('/')){ const [r,b]=sym.split('/'); return transposeSym(r,steps,preferFlat)+'/'+transposeSym(b,steps,preferFlat) }
  const m=sym.match(/^([A-G][#b]?)(.*)$/); if(!m) return sym
  const i=KEYS.indexOf(norm(m[1])); if(i===-1) return sym
  const root = KEYS[(i+steps+12)%12]
  const outRoot = preferFlat && SHARP_TO_FLAT[root] ? SHARP_TO_FLAT[root] : root
  return outRoot + (m[2]||'')
}

// Preserve original accidental choice: flats stay flats, sharps stay sharps.
export function transposeSymPrefer(sym, steps, defaultPreferFlat = false){
  if (steps === 0) return sym
  if (sym.includes('/')){
    const [r,b] = sym.split('/')
    return transposeSymPrefer(r, steps, defaultPreferFlat) + '/' + transposeSymPrefer(b, steps, defaultPreferFlat)
  }
  const m = sym.match(/^([A-G])([#b]?)(.*)$/)
  if (!m) return sym
  const [, base, acc, rest] = m
  const preferFlat = acc === 'b' ? true : (acc === '#' ? false : defaultPreferFlat)
  const idx = KEYS.indexOf(norm(base + (acc || '')))
  if (idx === -1) return sym
  const root = KEYS[(idx + steps + 12) % 12]
  const outRoot = preferFlat && SHARP_TO_FLAT[root] ? SHARP_TO_FLAT[root] : root
  return outRoot + (rest || '')
}

// Map sharp roots to their flat enharmonics for display
const SHARP_TO_FLAT = { 'C#':'Db', 'D#':'Eb', 'F#':'Gb', 'G#':'Ab', 'A#':'Bb' }

// Format a key (root + suffix like 'm') to preferred accidental style.
// pref: 'sharp' | 'flat'
export function formatKey(key, pref = 'sharp'){
  const s = String(key || '')
  const m = s.match(/^([A-G][#b]?)(.*)$/)
  if (!m) return s
  const root = norm(m[1])
  const rest = m[2] || ''
  if (pref === 'flat' && SHARP_TO_FLAT[root]) return SHARP_TO_FLAT[root] + rest
  return root + rest
}
