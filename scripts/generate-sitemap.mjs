import { promises as fs } from 'node:fs'
import path from 'node:path'

const BASE_URL = 'https://gracechords.com'
const root = process.cwd()
const outPath = path.join(root, 'public', 'sitemap.xml')
const indexData = await readJson(path.join(root, 'src', 'data', 'index.json'))
const resourcesData = await readJson(path.join(root, 'src', 'data', 'resources.json'))

const staticRoutes = [
  '/', // home
  '/about',
  '/songs',
  '/setlist',
  '/songbook',
  '/resources',
  '/bundle'
]

const urlMap = new Map()

async function readJson(filePath){
  try {
    const txt = await fs.readFile(filePath, 'utf8')
    return JSON.parse(txt)
  } catch (err) {
    console.warn(`Warning: failed to read ${filePath}: ${err?.message || err}`)
    return {}
  }
}

async function fileLastMod(filePath){
  try {
    const stat = await fs.stat(filePath)
    return stat.mtimeMs
  } catch {
    return null
  }
}

function encodeSlug(raw){
  if (!raw) return ''
  return encodeURIComponent(String(raw))
}

function formatDateUTC(d){
  return new Date(d).toISOString().split('T')[0]
}

const todayStr = formatDateUTC(Date.now())
function clampDateToToday(ms){
  if (!ms) return todayStr
  const candidate = formatDateUTC(ms)
  return candidate > todayStr ? todayStr : candidate
}

function addUrl(path, lastmod = todayStr){
  if (!path) return
  const safeLoc = path.startsWith('http') ? path : `${BASE_URL}${path}`
  const safeDate = clampDateToToday(lastmod)
  urlMap.set(safeLoc, safeDate)
}

for (const p of staticRoutes) addUrl(p, todayStr)

for (const song of (indexData?.items || [])) {
  const slug = song?.id || song?.filename?.replace(/\.chordpro$/, '')
  if (!slug) continue
  const loc = `/songs/${encodeSlug(slug)}`
  const songFile = song?.filename ? path.join(root, 'public', 'songs', song.filename) : null
  const mtime = songFile ? await fileLastMod(songFile) : null
  addUrl(loc, clampDateToToday(mtime))
}

for (const res of (resourcesData?.items || [])) {
  if (!res?.slug) continue
  const loc = `/resources/${encodeSlug(res.slug)}`
  const resFile = res?.filename ? path.join(root, 'public', 'resources', res.filename) : null
  const mtime = resFile ? await fileLastMod(resFile) : null
  addUrl(loc, clampDateToToday(mtime))
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Array.from(urlMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([loc, lastmod]) => (
    `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
  )),
  '</urlset>',
  ''
].join('\n')

await fs.mkdir(path.dirname(outPath), { recursive: true })
await fs.writeFile(outPath, xml, 'utf8')
console.log(`Wrote ${urlMap.size} URLs to ${outPath}`)
