import indexData from '../data/index.json'
import { KEYS } from './chordpro'

const KEY_CHARS = 'ABCDEFGHIJKL' // 12 symbols for 12 semitone keys (maps to KEYS index)

function fnv1a32(str){
  let h = 0x811c9dc5
  for(let i=0; i<str.length; i++){
    h ^= str.charCodeAt(i)
    h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0
  }
  return h >>> 0
}

function normKey(k){
  if(!k) return 'C'
  const i = KEYS.indexOf(k)
  if(i >= 0) return KEYS[i]
  // crude flats normalization
  const flat = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' }
  return flat[k] || 'C'
}

export function keyToChar(key){
  const k = normKey(String(key || 'C'))
  const idx = KEYS.indexOf(k)
  if (idx < 0) return 'A'
  return KEY_CHARS[idx]
}

export function charToKey(ch){
  const idx = KEY_CHARS.indexOf((ch || '').toUpperCase())
  if (idx < 0) return 'C'
  return KEYS[idx]
}

function buildMaps(items){
  const idToCode = new Map()
  const codeToId = new Map()
  const MOD = Math.pow(36, 4)
  for(const it of items){
    const id = String(it.id)
    let n = fnv1a32(id) % MOD
    // ensure 4-char base36, resolve collisions deterministically by linear probing
    for(let tries=0; tries<MOD; tries++){
      const code = n.toString(36).toUpperCase().padStart(4,'0')
      const existing = codeToId.get(code)
      if(!existing){ idToCode.set(id, code); codeToId.set(code, id); break }
      if(existing === id){ idToCode.set(id, code); break }
      n = (n + 1) % MOD
    }
  }
  return { idToCode, codeToId }
}

export function encodeSet(list){
  const items = (indexData?.items || [])
  const { idToCode } = buildMaps(items)
  let out = ''
  for(const sel of (list || [])){
    const code = idToCode.get(String(sel.id))
    if(!code) continue
    out += code + keyToChar(sel.toKey)
  }
  return out
}

export function decodeSet(code){
  const items = (indexData?.items || [])
  const { codeToId } = buildMaps(items)
  const s = String(code || '').trim()
  if(!s || (s.length % 5) !== 0) return { error: 'Invalid code length', entries: [] }
  const entries = []
  for(let i=0; i<s.length; i+=5){
    const block = s.slice(i, i+5)
    const idCode = block.slice(0,4)
    const keyChar = block.slice(4)
    const id = codeToId.get(idCode)
    if(!id) return { error: `Unknown song code: ${idCode}`, entries: [] }
    const key = charToKey(keyChar)
    entries.push({ id, toKey: key })
  }
  return { entries }
}

export default { encodeSet, decodeSet, keyToChar, charToKey }

