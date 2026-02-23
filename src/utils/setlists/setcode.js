import indexData from '../../data/index.json'
import { KEYS } from '../chordpro'
import {
  DEFAULT_BIBLE_TRANSLATION,
  parseVerseReference,
  makeVerseId,
  parseVerseId,
  isVerseId,
  normalizeTranslationId,
} from '../songs/verseRef'

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
    if (isVerseId(sel.id)) {
      const parsed = parseVerseId(sel.id)
      if (!parsed) continue
      out += `V${encodeVerseEntry(parsed)}`
      continue
    }
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
  if(!s) return { error: 'Invalid code length', entries: [] }
  const entries = []
  let i = 0
  while (i < s.length){
    const next = s[i]
    if (next === 'V'){
      const res = decodeVerseEntry(s.slice(i + 1))
      if (res.error) return { error: res.error, entries: [] }
      entries.push({ id: makeVerseId(res), toKey: '' })
      i += res.len + 1
      continue
    }
    const block = s.slice(i, i+5)
    if (block.length < 5) return { error: 'Invalid code length', entries: [] }
    const idCode = block.slice(0,4)
    const keyChar = block.slice(4)
    const id = codeToId.get(idCode)
    if(!id) return { error: `Unknown song code: ${idCode}`, entries: [] }
    const key = charToKey(keyChar)
    entries.push({ id, toKey: key })
    i += 5
  }
  return { entries }
}

function encodeVerseEntry(parsed){
  const translationKey = encodeString(normalizeTranslationId(parsed.translation))
  const bookKey = encodeString(parsed.book)
  const refKey = encodeString(parsed.refKey || parsed.ref)
  return `_${toBase36(translationKey.length, 2)}${translationKey}${toBase36(bookKey.length, 2)}${bookKey}${toBase36(refKey.length, 3)}${refKey}`
}

function decodeVerseEntry(encoded){
  if (encoded && encoded[0] === '_') return decodeVerseEntryV2(encoded)
  return decodeVerseEntryLegacy(encoded)
}

function decodeVerseEntryLegacy(encoded){
  if (!encoded || encoded.length < 5) return { error: 'Invalid verse code' }
  const bookLen = parseInt(encoded.slice(0, 2), 36)
  if (!bookLen || encoded.length < 2 + bookLen + 3) return { error: 'Invalid verse code' }
  const book = decodeString(encoded.slice(2, 2 + bookLen))
  const refLen = parseInt(encoded.slice(2 + bookLen, 5 + bookLen), 36)
  const startRef = 5 + bookLen
  const endRef = startRef + refLen
  if (!refLen || encoded.length < endRef) return { error: 'Invalid verse code' }
  const refKey = decodeString(encoded.slice(startRef, endRef))
  const ref = String(refKey || '').replace(/~/g, ',')
  const parsed = parseVerseReference(`${book} ${ref}`.trim(), { translation: DEFAULT_BIBLE_TRANSLATION })
  if (parsed.error) return { error: parsed.error }
  return { translation: parsed.translation, book: parsed.book, refKey: parsed.refKey, len: endRef }
}

function decodeVerseEntryV2(encoded){
  if (!encoded || encoded.length < 8) return { error: 'Invalid verse code' }
  const translationLen = parseInt(encoded.slice(1, 3), 36)
  if (!translationLen) return { error: 'Invalid verse code' }
  const translationStart = 3
  const translationEnd = translationStart + translationLen
  if (encoded.length < translationEnd + 5) return { error: 'Invalid verse code' }
  const translation = normalizeTranslationId(decodeString(encoded.slice(translationStart, translationEnd)))

  const bookLenStart = translationEnd
  const bookLen = parseInt(encoded.slice(bookLenStart, bookLenStart + 2), 36)
  if (!bookLen || encoded.length < bookLenStart + 2 + bookLen + 3) return { error: 'Invalid verse code' }
  const bookStart = bookLenStart + 2
  const bookEnd = bookStart + bookLen
  const book = decodeString(encoded.slice(bookStart, bookEnd))

  const refLenStart = bookEnd
  const refLen = parseInt(encoded.slice(refLenStart, refLenStart + 3), 36)
  if (!refLen) return { error: 'Invalid verse code' }
  const refStart = refLenStart + 3
  const refEnd = refStart + refLen
  if (encoded.length < refEnd) return { error: 'Invalid verse code' }

  const refKey = decodeString(encoded.slice(refStart, refEnd))
  const ref = String(refKey || '').replace(/~/g, ',')
  const parsed = parseVerseReference(`${book} ${ref}`.trim(), { translation })
  if (parsed.error) return { error: parsed.error }
  return { translation: parsed.translation, book: parsed.book, refKey: parsed.refKey, len: refEnd }
}

function encodeString(value){
  return String(value || '').replace(/-/g, '--').replace(/~/g, '-t').replace(/%/g, '-p')
}

function decodeString(value){
  let out = ''
  for (let i = 0; i < value.length; i += 1){
    const ch = value[i]
    if (ch !== '-') { out += ch; continue }
    const next = value[i + 1]
    if (next === '-') { out += '-'; i += 1; continue }
    if (next === 't') { out += '~'; i += 1; continue }
    if (next === 'p') { out += '%'; i += 1; continue }
    out += ch
  }
  return out
}

function toBase36(num, width){
  const safe = Math.max(0, Math.min(1295, Number(num) || 0))
  return safe.toString(36).toUpperCase().padStart(width, '0')
}

export default { encodeSet, decodeSet, keyToChar, charToKey }
