// Build src/data/index.json from public/songs/*.chordpro
import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const songsDir = path.join(root, 'public', 'songs')
const outFile = path.join(root, 'src', 'data', 'index.json')

async function main(){
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  const files = (await fs.readdir(songsDir)).filter(f=> f.endsWith('.chordpro'))
  const items = []
  for(const filename of files){
    const full = path.join(songsDir, filename)
    const text = await fs.readFile(full, 'utf8')
    const meta = parseMeta(text)
    const id = (meta.id || (meta.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')).replace(/(^-|-$)/g,'')
    items.push({
      id,
      title: meta.title || id || filename.replace(/\.chordpro$/,''),
      filename,
      originalKey: meta.key || meta.originalkey || '',
      tags: (meta.tags || '').split(',').map(s=>s.trim()).filter(Boolean),
      authors: meta.authors || '',
      country: meta.country || '',
      number: meta.number ? Number(meta.number) : undefined
    })
  }
  items.sort((a,b)=> a.title.localeCompare(b.title, undefined, {sensitivity:'base'}))
  await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2), 'utf8')
  console.log(`Wrote ${items.length} songs to ${outFile}`)
}

function parseMeta(text){
  const meta = {}
  const re = /^\{\s*([^:}]+)\s*:\s*([^}]*)\s*\}\s*$/gm
  let m
  while((m = re.exec(text))){
    meta[m[1].trim().toLowerCase()] = m[2].trim()
  }
  return meta
}

main().catch(err=>{ console.error(err); process.exit(1) })
