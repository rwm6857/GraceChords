import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://gracechords.com'
const root = process.cwd()
const outPath = path.join(root, 'public', 'sitemap.xml')

async function loadDotEnv() {
  try {
    const txt = await fs.readFile(path.join(root, '.env'), 'utf8')
    for (const line of txt.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = val
    }
  } catch { /* no .env file – rely on pre-set env vars */ }
}

await loadDotEnv()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const { data: songs, error: songsError } = await supabase
  .from('songs')
  .select('title, artist, slug, updated_at')
  .eq('is_deleted', false)
  .order('title')

if (songsError) {
  console.error('Supabase query failed:', songsError.message)
  process.exit(1)
}

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

for (const song of (songs || [])) {
  if (!song?.slug) continue
  const loc = `/songs/${encodeSlug(song.slug)}/`
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
