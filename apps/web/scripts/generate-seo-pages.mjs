import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { marked } from 'marked'

const SITE_URL = 'https://gracechords.com'
// Resolve paths from this script's location, not process.cwd(), so the build
// works regardless of where it is invoked from. scriptDir = apps/web/scripts.
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')                 // apps/web (dist, src, public)
const repoRoot = path.resolve(scriptDir, '..', '..', '..') // monorepo root (.env)
const docsDir = path.join(root, 'dist')
const templatePath = path.join(docsDir, 'index.html')

async function loadDotEnv() {
  try {
    const txt = await fs.readFile(path.join(repoRoot, '.env'), 'utf8')
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

// Cloudflare sets CF_PAGES_BRANCH on every Pages build. These artefacts are
// production-only: SITE_URL/BASE_URL below is hardcoded to the live domain, so
// generating them for a *.pages.dev preview would publish canonicals and a
// sitemap pointing at production from a preview host. Skipping also means a
// preview build needs no SUPABASE_SERVICE_ROLE_KEY — Pages keeps Production and
// Preview variables in separate sets, and that missing key is what failed the
// preview deploy. The credential check below is unchanged, so a production
// build still fails loudly when it is misconfigured.
const PRODUCTION_BRANCH = 'main'
if (process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== PRODUCTION_BRANCH) {
  console.log(`[seo-pages] Preview build (${process.env.CF_PAGES_BRANCH}) — skipping.`)
  process.exit(0)
}

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

const template = await fs.readFile(templatePath, 'utf8')

const genericDescription = 'GraceChords provides free worship chord sheets, lyrics, and resources for churches and worship teams. Open this page in GraceChords for the full experience.'

await buildSongPages(songs || [])
await buildResourcePages(resourcesData?.items || [])
await buildShellPages([
  { path: '/about', label: 'About' },
  { path: '/songs', label: 'Songs' },
  { path: '/resources', label: 'Resources' },
  { path: '/songbook', label: 'Songbook' },
  { path: '/setlist', label: 'Setlist' },
  { path: '/reading', label: 'Daily Word' },
  { path: '/bundle', label: 'Bundle' },
  { path: '/download', label: 'Download' }
])
await buildLegalPages([
  { path: '/privacy', title: 'Privacy Policy', file: 'privacy-policy.md', description: 'How GraceChords handles your data and privacy.' },
  { path: '/terms', title: 'Terms of Use', file: 'terms-of-use.md', description: 'The terms governing use of GraceChords.' },
  { path: '/delete-account', title: 'Delete Your Account', file: 'delete-account.md', description: 'How to delete your GraceChords account and the data that is removed.' }
])
await build404Page()

async function readJson(filePath){
  try {
    const txt = await fs.readFile(filePath, 'utf8')
    return JSON.parse(txt)
  } catch (err) {
    console.warn(`Warning: failed to read ${filePath}: ${err?.message || err}`)
    return {}
  }
}

async function buildSongPages(items){
  let count = 0
  for (const item of items) {
    const slug = item?.slug
    if (!slug) continue
    const title = (item?.title || slug).trim()
    const lyrics = ''
    const description = buildDescription(lyrics, buildSongFallback(title))
    const encoded = encodeURIComponent(slug)
    const canonical = `${SITE_URL}/songs/${encoded}/`
    const ld = buildSongLd(title, canonical, item)
    const body = buildLyricsBody(title, lyrics)
    const html = buildSeoHtml({ title: `${title} – Lyrics & Chords | GraceChords`, description, canonical, ld, body })
    const outPath = path.join(docsDir, 'songs', encoded, 'index.html')
    await writeFile(outPath, html)
    count += 1
  }
  console.log(`Generated ${count} song SEO page(s).`)
}

async function buildResourcePages(items){
  let count = 0
  for (const item of items) {
    const slug = item?.slug
    if (!slug || !item?.filename) continue
    const sourcePath = path.join(root, 'public', 'resources', item.filename)
    let raw = ''
    try { raw = await fs.readFile(sourcePath, 'utf8') } catch {}
    const ext = path.extname(item.filename || '').toLowerCase()
    let content = raw
    let text = ''
    let title = ''
    if (ext === '.md' || ext === '.mdx') {
      content = stripFrontmatter(raw)
      text = cleanMarkdownText(content)
      title = (item?.title || extractMarkdownTitle(content) || slug).trim()
    } else {
      text = cleanChordProText(raw)
      title = (item?.title || extractChordProTitle(raw) || slug).trim()
    }
    const description = buildDescription(text, item?.summary || buildResourceFallback(title))
    const encoded = encodeURIComponent(slug)
    const canonical = `${SITE_URL}/resources/${encoded}`
    const ld = buildResourceLd(title, canonical, item)
    const body = buildLyricsBody(title, text)
    const html = buildSeoHtml({ title: `${title} | GraceChords Resources`, description, canonical, ld, body })
    const outPath = path.join(docsDir, 'resources', encoded, 'index.html')
    await writeFile(outPath, html)
    count += 1
  }
  console.log(`Generated ${count} resource SEO page(s).`)
}

async function buildShellPages(routes){
  let count = 0
  for (const route of routes) {
    const label = route?.label || ''
    const pageTitle = label ? `${label} | GraceChords` : 'GraceChords'
    const canonical = `${SITE_URL}${route.path}`
    const body = `\n      <main>\n        <h1>GraceChords</h1>\n        <p>Loading...</p>\n      </main>\n    `
    const html = buildSeoHtml({ title: pageTitle, description: genericDescription, canonical, ld: null, body })
    const outPath = path.join(docsDir, route.path.replace(/^\//, ''), 'index.html')
    await writeFile(outPath, html)
    count += 1
  }
  console.log(`Generated ${count} shell page(s).`)
}

// Pre-render the legal pages with their full markdown content. Without a real
// file at these paths Cloudflare Pages serves dist/404.html with HTTP 404, and
// Google Play's policy check rejects the privacy-policy and account-deletion
// URLs even though the SPA renders them fine in a browser. The markdown is our
// own trusted source, so it is inlined without DOMPurify (which needs a DOM).
async function buildLegalPages(pages){
  let count = 0
  for (const page of pages) {
    const markdown = await fs.readFile(path.join(root, 'src', 'content', page.file), 'utf8')
    const body = `\n      <main class="container gc-post-detail">\n        <div class="gc-post-detail__content gc-prose">\n${marked.parse(markdown, { async: false })}\n        </div>\n      </main>\n    `
    const canonical = `${SITE_URL}${page.path}`
    const html = buildSeoHtml({ title: `${page.title} · GraceChords`, description: page.description, canonical, ld: null, body })
    // Written as `privacy.html` rather than `privacy/index.html`: Pages serves
    // the former at `/privacy` with a 200, the latter only via a 308 to
    // `/privacy/`, and these exact URLs are the ones declared in Play Console.
    const outPath = path.join(docsDir, `${page.path.replace(/^\//, '')}.html`)
    await writeFile(outPath, html)
    count += 1
  }
  console.log(`Generated ${count} legal page(s).`)
}

async function build404Page(){
  const script = `<script>(function(){var p=window.location.pathname+window.location.search+window.location.hash;var t='/?redirect='+encodeURIComponent(p);window.location.replace(t)})();</script>`
  let html = template
  if (/<head>/i.test(html)) {
    html = html.replace(/<head>/i, `<head>\n    ${script}`)
  } else {
    html = `${script}\n${html}`
  }
  html = absolutizeAssetPaths(html)
  const outPath = path.join(docsDir, '404.html')
  await writeFile(outPath, html)
  console.log('Generated dist/404.html for deep-link redirects.')
}

function buildSeoHtml({ title, description, canonical, ld, body }){
  let html = template
  html = replaceTitle(html, title)
  html = stripHeadTags(html)
  html = insertHeadTags(html, { description, canonical, ld })
  html = replaceRoot(html, body)
  html = absolutizeAssetPaths(html)
  return html
}

function replaceTitle(html, title){
  const safeTitle = escapeHtml(title)
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
  }
  return html.replace(/<head>/i, `<head>\n    <title>${safeTitle}</title>`)
}

function stripHeadTags(html){
  return html
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '')
}

function insertHeadTags(html, { description, canonical, ld }){
  const tags = []
  if (description) {
    tags.push(`<meta name="description" content="${escapeAttr(description)}" />`)
  }
  if (canonical) {
    tags.push(`<link rel="canonical" href="${escapeAttr(canonical)}" />`)
  }
  if (ld) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
  }
  if (!tags.length) return html
  return html.replace(/<\/head>/i, `    ${tags.join('\n    ')}\n  </head>`)
}

function replaceRoot(html, body){
  const content = body || ''
  if (/<div id="root">[\s\S]*?<\/div>/i.test(html)) {
    // Function replacement so a literal "$" in page content isn't read as a
    // replacement pattern ($&, $1, ...).
    return html.replace(/<div id="root">[\s\S]*?<\/div>/i, () => `<div id="root">${content}</div>`)
  }
  return html
}

function absolutizeAssetPaths(html){
  const hrefRe = new RegExp("href=(['\"])\\\\./", 'g')
  const srcRe = new RegExp("src=(['\"])\\\\./", 'g')
  return html.replace(hrefRe, 'href=$1/').replace(srcRe, 'src=$1/')
}

function buildLyricsBody(title, text){
  const safeTitle = escapeHtml(title || 'GraceChords')
  const safeText = escapeHtml(text || '')
  return `\n      <main>\n        <h1>${safeTitle}</h1>\n        <pre class="gc-seo-lyrics">${safeText}</pre>\n        <p><a href="/">Open GraceChords</a></p>\n      </main>\n    `
}

function buildDescription(text, fallback){
  const clean = collapseWhitespace(text)
  if (!clean) return fallback || genericDescription
  if (clean.length <= 170) return clean
  let summary = clean.slice(0, 170)
  summary = summary.replace(/\s+\S*$/, '').trim()
  if (summary.length < 150 && clean.length > 170) {
    summary = clean.slice(0, 170).trim()
  }
  return summary
}

function collapseWhitespace(text){
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function buildSongFallback(title){
  if (!title) return genericDescription
  return `Free worship chord sheet and lyrics for ${title}. Transposable and printable on GraceChords for worship teams and churches.`
}

function buildResourceFallback(title){
  if (!title) return genericDescription
  return `${title} on GraceChords. Worship resources, chord sheets, and guides for church musicians and worship teams.`
}

function buildSongLd(title, url, item){
  const artist = item?.artist
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: title || 'Song',
    url
  }
  if (artist) {
    ld.lyricist = artist
    ld.composer = artist
  }
  return ld
}

function buildResourceLd(title, url, item){
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title || 'GraceChords Resource',
    author: item?.author || 'GraceChords',
    datePublished: item?.date,
    dateModified: item?.date,
    url
  }
}

function extractChordProTitle(raw){
  const match = /\{\s*(?:title|t)\s*:\s*([^}]+)\}/i.exec(raw || '')
  return match ? match[1].trim() : ''
}

function cleanChordProText(raw){
  let text = String(raw || '').replace(/\r\n/g, '\n')
  text = text.replace(/^\s*#.*$/gm, '')
  text = text.replace(/\{[^}\n]*\}/g, '')
  text = text.replace(/\[[^\]]+\]/g, '')
  text = text.replace(/[ \t]+$/gm, '')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function stripFrontmatter(raw){
  return String(raw || '').replace(/^---[\s\S]*?---\s*/,'')
}

function extractMarkdownTitle(raw){
  const match = /^\s*#\s+(.+)$/m.exec(raw || '')
  return match ? match[1].trim() : ''
}

function cleanMarkdownText(raw){
  let text = String(raw || '').replace(/\r\n/g, '\n')
  text = text.replace(/^:{2,3}youtube[^\n]*$/gim, '')
  text = text.replace(/```[\s\S]*?```/g, '')
  text = text.replace(/`[^`]*`/g, '')
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/^>\s?/gm, '')
  text = text.replace(/^#{1,6}\s*/gm, '')
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')
  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(/\[[^\]]+\]/g, '')
  text = text.replace(/[ \t]+$/gm, '')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function escapeHtml(value){
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value){
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function writeFile(filePath, html){
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, html, 'utf8')
}
