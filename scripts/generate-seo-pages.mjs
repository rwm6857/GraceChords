import { promises as fs } from 'node:fs'
import path from 'node:path'

const SITE_URL = 'https://gracechords.com'
const root = process.cwd()
const docsDir = path.join(root, 'docs')
const templatePath = path.join(docsDir, 'index.html')
const indexData = await readJson(path.join(root, 'src', 'data', 'index.json'))
const resourcesData = await readJson(path.join(root, 'src', 'data', 'resources.json'))

const template = await fs.readFile(templatePath, 'utf8')

const genericDescription = 'GraceChords provides free worship chord sheets, lyrics, and resources for churches and worship teams. Open this page in GraceChords for the full experience.'

await buildSongPages(indexData?.items || [])
await buildResourcePages(resourcesData?.items || [])
await buildShellPages([
  { path: '/about', label: 'About' },
  { path: '/songs', label: 'Songs' },
  { path: '/resources', label: 'Resources' },
  { path: '/songbook', label: 'Songbook' },
  { path: '/setlist', label: 'Setlist' },
  { path: '/bundle', label: 'Bundle' }
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
    const id = item?.id || (item?.filename ? item.filename.replace(/\.chordpro$/, '') : '')
    if (!id || !item?.filename) continue
    const sourcePath = path.join(root, 'public', 'songs', item.filename)
    let raw = ''
    try { raw = await fs.readFile(sourcePath, 'utf8') } catch {}
    const title = (item?.title || extractChordProTitle(raw) || id).trim()
    const lyrics = cleanChordProText(raw)
    const description = buildDescription(lyrics, buildSongFallback(title))
    const encoded = encodeURIComponent(id)
    const canonical = `${SITE_URL}/songs/${encoded}`
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
  console.log('Generated docs/404.html for deep-link redirects.')
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
    return html.replace(/<div id="root">[\s\S]*?<\/div>/i, `<div id="root">${content}</div>`)
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
  const authors = Array.isArray(item?.authors) ? item.authors.filter(Boolean) : []
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicComposition',
    name: title || 'Song',
    url
  }
  if (authors.length) {
    const names = authors.join(', ')
    ld.lyricist = names
    ld.composer = names
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
