import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')
const pptxSrcDir = path.join(root, 'TO_RENAME')
const pptxDstDir = path.join(root, 'public', 'pptx')

const RX_DIRECTIVE = /^\s*{[^}]+}\s*$/
const RX_CHORDS_ONLY = /^\s*(?:[[^]]+]\s*)+$/

function hasLyrics(content){
for (const raw of content.split(/\r?\n/)){
    const t = raw.trim()
    if (!t) continue
    if (RX_DIRECTIVE.test(t)) continue
    if (RX_CHORDS_ONLY.test(t)) continue
    return true
}
return false
}

function normalizeUnderscoreName(name){
const base = name.replace(/.[^.]+$/, '')
const cleaned = base
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
return cleaned
}

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }) }

async function normalizePptx(){
try { await fs.access(pptxSrcDir) } catch { console.log('No TO_RENAME/ dir found — skipping PPTX normalization'); return }
await ensureDir(pptxDstDir)
const files = (await fs.readdir(pptxSrcDir)).filter(f => f.toLowerCase().endsWith('.pptx'))
let moved = 0, skipped = 0
for (const f of files){
    const norm = normalizeUnderscoreName(f) + '.pptx'
    const src = path.join(pptxSrcDir, f)
    const dst = path.join(pptxDstDir, norm)
    try {
      await fs.access(dst)
      skipped++
    } catch {
      await fs.copyFile(src, dst)
      moved++
    }
}
console.log(`PPTX: copied ${moved} file(s) to public/pptx, skipped ${skipped} (already exist).`)
}

async function normalizeSongs(){
const files = (await fs.readdir(songsDir)).filter(f => f.toLowerCase().endsWith('.chordpro'))
const byTarget = new Map()
for (const f of files){
    const underscoreName = normalizeUnderscoreName(f) + '.chordpro'
    const list = byTarget.get(underscoreName) || []
    list.push(f)
    byTarget.set(underscoreName, list)
}
let renamed = 0, removed = 0
for (const [target, group] of byTarget.entries()){
    if (group.length === 1){
      const current = group[0]
      if (current !== target){
        await fs.rename(path.join(songsDir, current), path.join(songsDir, target))
        renamed++
      }
      continue
    }
    const underscore = group.find(n => n === target)
    const others = group.filter(n => n !== target)
    let keep = underscore
    let keepHasLyrics = false
    if (underscore){
      const content = await fs.readFile(path.join(songsDir, underscore), 'utf8').catch(()=> '')
      keepHasLyrics = hasLyrics(content)
    }
    let lyricalHyphen = null
    for (const h of others){
      const content = await fs.readFile(path.join(songsDir, h), 'utf8').catch(()=> '')
      if (hasLyrics(content)) { lyricalHyphen = h; break }
    }
    if (!keepHasLyrics && lyricalHyphen){
      if (underscore){ await fs.unlink(path.join(songsDir, underscore)).catch(()=>{}) }
      await fs.rename(path.join(songsDir, lyricalHyphen), path.join(songsDir, target))
      removed++
      for (const h of others){ if (h !== lyricalHyphen) { await fs.unlink(path.join(songsDir, h)).catch(()=>{}); removed++ } }
      continue
    }
    for (const h of others){ await fs.unlink(path.join(songsDir, h)).catch(()=>{}); removed++ }
}
console.log(`Songs: renamed ${renamed} and removed ${removed} duplicate(s).`)
}

async function main(){
await normalizePptx()
await normalizeSongs()
console.log('Done. Consider running: npm run build-index')
}

main().catch(e => { console.error(e); process.exit(1) })
