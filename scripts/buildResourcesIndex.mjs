import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const resourcesDir = path.join(root, 'public', 'resources')
const outFile = path.join(root, 'src', 'data', 'resources.json')

async function main(){
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  let files = []
  try { files = await fs.readdir(resourcesDir) } catch { files = [] }
  files = files.filter(f => f.endsWith('.md'))
  const items = []
  for (const filename of files){
    const full = path.join(resourcesDir, filename)
    const raw = await fs.readFile(full, 'utf8')
    const { meta } = parseFrontmatter(raw)
    if (!meta.title || !meta.author || !meta.date){
      console.warn(`[resources] Skipping ${filename}: missing required metadata (title, author, date)`) 
      continue
    }
    const slug = filename.replace(/\.md$/i, '')
    const tags = Array.isArray(meta.tags) ? meta.tags : parseTags(meta.tags)
    items.push({
      slug,
      title: String(meta.title || slug),
      author: String(meta.author || ''),
      date: String(meta.date || ''),
      tags,
      summary: String(meta.summary || ''),
      filename,
    })
  }
  items.sort((a,b) => (b.date || '').localeCompare(a.date || ''))
  const out = { generatedAt: new Date().toISOString(), items }
  await fs.writeFile(outFile, JSON.stringify(out, null, 2), 'utf8')
  console.log(`Wrote ${items.length} resources to ${outFile}`)
}

function parseFrontmatter(text){
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(text)
  if(!m) return { meta: {}, content: text }
  const metaBlock = m[1]
  const content = m[2]
  const meta = {}
  const lines = metaBlock.split(/\r?\n/)
  for (const ln of lines){
    const mm = /^([^:]+):\s*(.*)$/.exec(ln)
    if(!mm) continue
    const key = mm[1].trim().toLowerCase()
    let val = mm[2].trim()
    if(/^\[.*\]$/.test(val)){
      try { val = JSON.parse(val) } catch {}
    } else if (/^".*"$/.test(val) || /^'.*'$/.test(val)){
      val = val.replace(/^['"]|['"]$/g,'')
    }
    meta[key] = val
  }
  return { meta, content }
}

function parseTags(val){
  if (!val) return []
  return String(val).split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

main().catch(err => { console.error(err); process.exit(1) })

