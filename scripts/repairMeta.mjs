#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run')

// Convert lines like: {meta: country USA}  -->  {country: USA}
// Case-insensitive on "meta"; preserves the captured key as-is; trims value.
const RX_META_LINE = /^\{\s*meta\s*:\s*([^\s:}]+)\s*([^}]*)\s*\}\s*$/gmi

function rewriteMeta(text){
  let changed = false
  const next = text.replace(RX_META_LINE, (full, key, rest) => {
    changed = true
    const val = String(rest || '').trim()
    return `{${key}: ${val}}`
  })
  return { text: next, changed }
}

async function main(){
  const entries = await fs.readdir(songsDir).catch(() => [])
  const files = entries.filter(f => f.toLowerCase().endsWith('.chordpro'))
  let touched = 0
  for (const f of files){
    const p = path.join(songsDir, f)
    const raw = await fs.readFile(p, 'utf8').catch(() => '')
    const { text, changed } = rewriteMeta(raw)
    if (changed){
      touched++
      if (DRY){
        console.log(`[dry] would fix: ${f}`)
      } else {
        await fs.writeFile(p, text, 'utf8')
        console.log(`fixed: ${f}`)
      }
    }
  }
  if (touched === 0) console.log('No files needed changes.')
  else console.log(`${DRY ? 'Would fix' : 'Fixed'} ${touched} file(s).`)
}

main().catch(e => { console.error(e); process.exit(1) })

