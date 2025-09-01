import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')
const pptxSrcDir = path.join(root, 'TO_RENAME')
const pptxDstDir = path.join(root, 'public', 'pptx')

<<<<<<< HEAD
const RX_DIRECTIVE = /^\s*{[^}]+}\s*$/
const RX_CHORDS_ONLY = /^\s*(?:[[^]]+]\s*)+$/

function hasLyrics(content){
for (const raw of content.split(/\r?\n/)){
=======
const RX_DIRECTIVE = /^\s*\{[^}]+\}\s*$/
const RX_CHORDS_ONLY = /^\s*(?:\[[^\]]+\]\s*)+$/

function hasLyrics(content){
  for (const raw of content.split(/\r?\n/)){
>>>>>>> f91dd70b (pptx normalization)
    const t = raw.trim()
    if (!t) continue
    if (RX_DIRECTIVE.test(t)) continue
    if (RX_CHORDS_ONLY.test(t)) continue
    return true
<<<<<<< HEAD
}
return false
}

function normalizeUnderscoreName(name){
const base = name.replace(/.[^.]+$/, '')
const cleaned = base
=======
  }
  return false
}

function normalizeUnderscoreName(name){
  // Lowercase, replace spaces & dashes with underscore, strip non-word, collapse underscores
  const base = name.replace(/\.[^.]+$/, '')
  const cleaned = base
>>>>>>> f91dd70b (pptx normalization)
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
<<<<<<< HEAD
return cleaned
=======
  return cleaned
>>>>>>> f91dd70b (pptx normalization)
}

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }) }

async function normalizePptx(){
<<<<<<< HEAD
try { await fs.access(pptxSrcDir) } catch { console.log('No TO_RENAME/ dir found — skipping PPTX normalization'); return }
await ensureDir(pptxDstDir)
const files = (await fs.readdir(pptxSrcDir)).filter(f => f.toLowerCase().endsWith('.pptx'))
let moved = 0, skipped = 0
for (const f of files){
=======
  try { await fs.access(pptxSrcDir) } catch { console.log('No TO_RENAME/ dir found — skipping PPTX normalization'); return }
  await ensureDir(pptxDstDir)
  const files = (await fs.readdir(pptxSrcDir)).filter(f => f.toLowerCase().endsWith('.pptx'))
  let moved = 0, skipped = 0
  for (const f of files){
>>>>>>> f91dd70b (pptx normalization)
    const norm = normalizeUnderscoreName(f) + '.pptx'
    const src = path.join(pptxSrcDir, f)
    const dst = path.join(pptxDstDir, norm)
    try {
<<<<<<< HEAD
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
=======
      // If destination exists, skip to avoid overwriting
      await fs.access(dst).then(() => { skipped++ }).catch(async () => {
        await fs.copyFile(src, dst)
        moved++
      })
    } catch (e) {
      console.warn('PPTX normalize error for', f, e?.message || e)
    }
  }
  console.log(`PPTX: copied ${moved} file(s) to public/pptx, skipped ${skipped} (already exist).`)
}

async function normalizeSongs(){
  const files = (await fs.readdir(songsDir)).filter(f => f.toLowerCase().endsWith('.chordpro'))
  const byTarget = new Map()
  for (const f of files){
>>>>>>> f91dd70b (pptx normalization)
    const underscoreName = normalizeUnderscoreName(f) + '.chordpro'
    const list = byTarget.get(underscoreName) || []
    list.push(f)
    byTarget.set(underscoreName, list)
<<<<<<< HEAD
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
=======
  }
  let renamed = 0, removed = 0
  for (const [target, group] of byTarget.entries()){
    if (group.length === 1){
      const current = group[0]
      if (current === target) continue
      // simple rename from hyphen → underscore (or other normalization)
      await fs.rename(path.join(songsDir, current), path.join(songsDir, target))
      renamed++
      continue
    }
    // Conflict: multiple files map to the same underscore target
    // Strategy:
    // - If underscore variant exists and has lyrics, keep it; remove others with hyphens
    // - If underscore exists but has no lyrics and a hyphen has lyrics, replace underscore with hyphen (prefer content)
    // - Otherwise keep underscore, remove hyphens
>>>>>>> f91dd70b (pptx normalization)
    const underscore = group.find(n => n === target)
    const others = group.filter(n => n !== target)
    let keep = underscore
    let keepHasLyrics = false
    if (underscore){
      const content = await fs.readFile(path.join(songsDir, underscore), 'utf8').catch(()=> '')
      keepHasLyrics = hasLyrics(content)
    }
<<<<<<< HEAD
=======
    // Check hyphen candidates for lyrics
>>>>>>> f91dd70b (pptx normalization)
    let lyricalHyphen = null
    for (const h of others){
      const content = await fs.readFile(path.join(songsDir, h), 'utf8').catch(()=> '')
      if (hasLyrics(content)) { lyricalHyphen = h; break }
    }
    if (!keepHasLyrics && lyricalHyphen){
<<<<<<< HEAD
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
=======
      // replace underscore with lyrical hyphen content
      if (underscore){ await fs.unlink(path.join(songsDir, underscore)).catch(()=>{}) }
      await fs.rename(path.join(songsDir, lyricalHyphen), path.join(songsDir, target))
      removed++ // removed old underscore
      // remove remaining others
      for (const h of others){ if (h !== lyricalHyphen) { await fs.unlink(path.join(songsDir, h)).catch(()=>{}); removed++ } }
      continue
    }
    // Keep underscore, drop others
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

>>>>>>> f91dd70b (pptx normalization)
