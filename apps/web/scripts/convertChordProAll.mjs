import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')

const RX_META = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/
const RX_LONG = /^\{\s*(?:start_of|end_of)_(?:verse|chorus|bridge|intro|tag|outro)\b.*\}\s*$/i
const RX_SHORT = /^\{\s*(?:sov|eov|soc|eoc|sob|eob)(?::?\s*[^}]*)?\s*\}\s*$/i
const RX_BRACKET_HDR = /^\s*\[\s*([^\]]+)\s*\]\s*$/
const RX_PLAIN_HDR = /^(verse|chorus|bridge|intro|tag|outro|ending|refrain)(?:\s+(\d+))?$/i

function normalizeHeader(labelRaw = ''){
  const s = String(labelRaw).trim()
  const m = RX_PLAIN_HDR.exec(s)
  if (!m) return { kind: 'verse', label: s || 'Verse' }
  const kind = m[1].toLowerCase()
  const num = m[2] ? ` ${m[2]}` : ''
  const cleanKind = kind === 'ending' ? 'outro' : (kind === 'refrain' ? 'chorus' : kind)
  const label = `${cleanKind.charAt(0).toUpperCase()}${cleanKind.slice(1)}${num}`
  return { kind: cleanKind, label }
}

function convertContent(text){
  const lines = text.replace(/\r\n/g,'\n').split('\n')
  const out = []
  let open = null // { kind, label }
  const shortStart = { verse: 'sov', chorus: 'soc', bridge: 'sob' }
  const shortEnd = { verse: 'eov', chorus: 'eoc', bridge: 'eob' }
  const close = () => {
    if (open) {
      const endCode = shortEnd[open.kind]
      out.push(endCode ? `{${endCode}}` : `{end_of_${open.kind}}`)
      open = null
    }
  }
  const openEnv = (kind, label) => {
    close()
    const code = shortStart[kind]
    if (code) out.push(`{${code}${label ? ' ' + label : ''}}`)
    else out.push(`{start_of_${kind}: ${label || kind}}`)
    open = { kind, label }
  }

  for (const raw of lines){
    const t = raw.trim()
    if (t === '') { out.push(raw); continue }
    // Already directive-based? keep as-is
    if (RX_META.test(t) || RX_LONG.test(t) || RX_SHORT.test(t)) { out.push(raw); continue }
    const mB = RX_BRACKET_HDR.exec(t)
    if (mB){ const { kind, label } = normalizeHeader(mB[1]); openEnv(kind, label); continue }
    const mP = RX_PLAIN_HDR.exec(t)
    if (mP){ const { kind, label } = normalizeHeader(t); openEnv(kind, label); continue }
    // Default: ensure an open env exists
    if (!open){ openEnv('verse', 'Verse') }
    out.push(raw)
  }
  close()
  return out.join('\n')
}

async function main(){
  const files = (await fs.readdir(songsDir)).filter(f => f.endsWith('.chordpro'))
  let changed = 0
  for (const f of files){
    const full = path.join(songsDir, f)
    const original = await fs.readFile(full, 'utf8')
    // Skip files that already look directive-based
    if (/\{\s*(start_of|end_of)_(verse|chorus|bridge|intro|tag|outro)/i.test(original) || /\{\s*(sov|eov|soc|eoc|sob|eob)/i.test(original)) continue
    const next = convertContent(original)
    if (next !== original){
      await fs.writeFile(full, next, 'utf8')
      changed++
    }
  }
  console.log(`Converted ${changed} song(s) to short-form ChordPro environments`)
}

main().catch(err => { console.error(err); process.exit(1) })

