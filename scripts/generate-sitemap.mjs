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
  '/reading',
  '/resources',
  '/bundle'
]

const urlSet = new Set()

async function readJson(filePath){
  try {
    const txt = await fs.readFile(filePath, 'utf8')
    return JSON.parse(txt)
  } catch (err) {
    console.warn(`Warning: failed to read ${filePath}: ${err?.message || err}`)
    return {}
  }
}

function encodeSlug(raw){
  if (!raw) return ''
  return encodeURIComponent(String(raw))
}

function addUrl(path){
  if (!path) return
  const safeLoc = path.startsWith('http') ? path : `${BASE_URL}${path}`
  urlSet.add(safeLoc)
}

for (const p of staticRoutes) addUrl(p)

for (const song of (indexData?.items || [])) {
  const slug = song?.id || song?.filename?.replace(/\.chordpro$/, '')
  if (!slug) continue
  const loc = `/songs/${encodeSlug(slug)}`
  addUrl(loc)
}

for (const res of (resourcesData?.items || [])) {
  if (!res?.slug) continue
  const loc = `/resources/${encodeSlug(res.slug)}`
  addUrl(loc)
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Array.from(urlSet.values()).sort((a, b) => a.localeCompare(b)).map((loc) => (
    `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`
  )),
  '</urlset>',
  ''
].join('\n')

await fs.mkdir(path.dirname(outPath), { recursive: true })
await fs.writeFile(outPath, xml, 'utf8')
console.log(`Wrote ${urlSet.size} URLs to ${outPath}`)
