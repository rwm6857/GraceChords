import { promises as fs } from 'node:fs'
import path from 'node:path'

const BASE_URL = 'https://gracechords.com'
const root = process.cwd()
const outPath = path.join(root, 'public', 'sitemap.xml')
const indexData = await readJson(path.join(root, 'src', 'data', 'index.json'))
const resourcesData = await readJson(path.join(root, 'src', 'data', 'resources.json'))

const staticRoutes = [
  '/#/',
  '/#/about',
  '/#/setlist',
  '/#/songbook',
  '/#/resources',
  '/#/bundle'
]

const urls = new Set(staticRoutes.map((p) => `${BASE_URL}${p}`))

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

for (const song of (indexData?.items || [])) {
  const slug = song?.id || song?.filename?.replace(/\.chordpro$/, '')
  if (!slug) continue
  urls.add(`${BASE_URL}/#/song/${encodeSlug(slug)}`)
}

for (const res of (resourcesData?.items || [])) {
  if (!res?.slug) continue
  urls.add(`${BASE_URL}/#/resources/${encodeSlug(res.slug)}`)
}

const today = new Date().toISOString().slice(0, 10)
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...Array.from(urls).sort().map((loc) => (
    `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <lastmod>${today}</lastmod>\n  </url>`
  )),
  '</urlset>',
  ''
].join('\n')

await fs.mkdir(path.dirname(outPath), { recursive: true })
await fs.writeFile(outPath, xml, 'utf8')
console.log(`Wrote ${urls.size} URLs to ${outPath}`)
