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

const { data: posts, error: postsError } = await supabase
  .from('posts')
  .select('slug, title, excerpt, content, tags, published_at, updated_at')
  .eq('status', 'published')
  .order('published_at', { ascending: false })

if (postsError) {
  console.error('Supabase posts query failed:', postsError.message)
  process.exit(1)
}

// The home-hero preload (vite.config.js `inject-lcp-preload`) only helps `/`.
// Every page generated here is another route, where it would spend ~20-60 KiB
// of high-priority bandwidth on an image that is never shown.
const template = (await fs.readFile(templatePath, 'utf8'))
  .replace(/\s*<link rel="preload" as="image"[^>]*dashboard-hero[^>]*>/, '')

// Song pages render lyrics in Noto Sans and chords in Noto Sans Mono Bold, but
// the browser only discovers those fonts once React has fetched the song and
// rendered it, so the text first paints in a fallback font and then swaps,
// shifting every block below it (CLS ~0.1). Preloading the Latin subsets (see
// src/styles/fonts.css) makes them arrive before that first render.
const SONG_FONT_PRELOADS = ['NotoSans-Regular-latin', 'NotoSansMono-Bold-latin']
  .map((name) => `<link rel="preload" href="/fonts/${name}.woff2" as="font" type="font/woff2" crossorigin>`)
  .join('\n    ')

const genericDescription = 'GraceChords provides free worship chord sheets, lyrics, and resources for churches and worship teams. Open this page in GraceChords for the full experience.'

await buildSongPages(songs || [])
await buildPostPages(posts || [])
await buildShellPages([
  { path: '/about', label: 'About' },
  { path: '/songs', label: 'Songs' },
  { path: '/posts', label: 'Posts' },
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
      .replace('</head>', `    ${SONG_FONT_PRELOADS}\n  </head>`)
    const outPath = path.join(docsDir, 'songs', encoded, 'index.html')
    await writeFile(outPath, html)
    count += 1
  }
  console.log(`Generated ${count} song SEO page(s).`)
}

async function buildPostPages(items){
  let count = 0
  for (const item of items) {
    const slug = item?.slug
    if (!slug) continue
    const title = (item?.title || slug).trim()
    const text = htmlToText(item?.content)
    const description = item?.excerpt?.trim() || buildDescription(text, buildPostFallback(title))
    const encoded = encodeURIComponent(slug)
    const canonical = `${SITE_URL}/posts/${encoded}`
    const ld = buildPostLd(title, canonical, item)
    const body = buildLyricsBody(title, text)
    const html = buildSeoHtml({ title: `${title} · GraceChords`, description, canonical, ld, body })
    // `<slug>.html`, not `<slug>/index.html`, so Pages serves the in-app link
    // `/posts/<slug>` with a 200 instead of a 308 to `/posts/<slug>/`.
    const outPath = path.join(docsDir, 'posts', `${encoded}.html`)
    await writeFile(outPath, html)
    count += 1
  }
  console.log(`Generated ${count} post SEO page(s).`)
}

async function buildShellPages(routes){
  let count = 0
  for (const route of routes) {
    const label = route?.label || ''
    const pageTitle = label ? `${label} | GraceChords` : 'GraceChords'
    const canonical = `${SITE_URL}${route.path}`
    const body = `\n      <main>\n        <h1>GraceChords</h1>\n        <p>Loading...</p>\n      </main>\n    `
    const html = buildSeoHtml({ title: pageTitle, description: genericDescription, canonical, ld: null, body })
    // `<route>.html`, not `<route>/index.html`, for the same reason as the legal
    // pages below: Pages serves it at `/songs` with a 200 instead of a 308 to
    // `/songs/` (~750 ms on mobile for every visit from search or the sitemap).
    const outPath = path.join(docsDir, `${route.path.replace(/^\//, '')}.html`)
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
    // JSON.stringify leaves "<" alone, so a title containing "</script>" would
    // close this tag and inject markup. \u003c is the same character to a JSON
    // parser but can't end the script element.
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`)
  }
  if (!tags.length) return html
  return html.replace(/<\/head>/i, `    ${tags.join('\n    ')}\n  </head>`)
}

function replaceRoot(html, body){
  // Greedy on purpose: #root is the last element in the built body (Vite
  // hoists the entry script into <head>), so its closing tag is the last
  // </div> in the file. A non-greedy match stopped inside #root's own comment
  // and left broken markup (a stray visible "-->") on every generated page.
  // Declared in here, not at module level: the top-level awaits above run the
  // page builders before a module-level const below them is initialised.
  const ROOT_RE = /<div id="root">[\s\S]*<\/div>/i
  const content = body || ''
  if (ROOT_RE.test(html)) {
    // Function replacement so a literal "$" in page content isn't read as a
    // replacement pattern ($&, $1, ...).
    return html.replace(ROOT_RE, () => `<div id="root">${content}</div>`)
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

function buildPostFallback(title){
  if (!title) return genericDescription
  return `${title} on GraceChords. News, guides, and worship resources for church musicians and worship teams.`
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

function buildPostLd(title, url, item){
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title || 'GraceChords Post',
    author: 'GraceChords',
    datePublished: item?.published_at || undefined,
    dateModified: item?.updated_at || item?.published_at || undefined,
    url
  }
}

// Post bodies are Tiptap HTML. Reduce them to plain text: the SEO body is
// escaped into a <pre>, so editor markup never reaches the page unsanitised.
function htmlToText(html){
  let text = String(html || '').replace(/\r\n/g, '\n')
  // Repeat until stable so a nested "<scr<script></script>ipt>" can't leave a
  // script block behind. (Safety doesn't depend on this — every caller escapes
  // the result — it keeps script/style text out of the SEO copy.)
  let previous
  do {
    previous = text
    text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
  } while (text !== previous)
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n\n')
  text = text.replace(/<[^>]+>/g, '')
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
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
