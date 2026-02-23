// Minimal frontmatter + markdown utilities for resources

export function parseFrontmatter(text = ''){
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(text)
  if(!m) return { meta: {}, content: text }
  const metaBlock = m[1]
  const content = m[2]
  const meta = {}
  for (const ln of metaBlock.split(/\r?\n/)){
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

export function slugifyKebab(s = ''){
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function stripMarkdown(md = ''){
  let t = String(md || '')
  t = t.replace(/^:{2,3}youtube[^\n]*$/gim, ' ')
  t = t.replace(/`{3}[\s\S]*?`{3}/g, ' ') // code blocks
  t = t.replace(/`[^`]*`/g, ' ') // inline code
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
  t = t.replace(/\[[^\]]*\]\([^)]*\)/g, ' ') // links
  t = t.replace(/^>\s?/gm, '') // blockquotes
  t = t.replace(/^#{1,6}\s*/gm, '') // headings
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

export function extractYoutubeId(raw = ''){
  const s = String(raw || '').trim()
  if (!s) return ''
  const ID_RE = /^[A-Za-z0-9_-]{6,24}$/
  if (ID_RE.test(s)) return s.slice(0, 24)
  try {
    const url = new URL(s)
    const searchId = url.searchParams.get('v') || url.searchParams.get('vi')
    if (searchId && ID_RE.test(searchId)) return searchId.slice(0, 24)
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.hostname.includes('youtu.be') && parts[0] && ID_RE.test(parts[0])) return parts[0].slice(0, 24)
    const markers = ['embed', 'shorts', 'v', 'video']
    const markerIdx = parts.findIndex(p => markers.includes(p))
    if (markerIdx >= 0 && parts[markerIdx + 1] && ID_RE.test(parts[markerIdx + 1])) {
      return parts[markerIdx + 1].slice(0, 24)
    }
    const tail = parts[parts.length - 1]
    if (tail && ID_RE.test(tail)) return tail.slice(0, 24)
  } catch {}
  const legacy = /(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,24})/i.exec(s)
  return legacy ? legacy[1].slice(0, 24) : ''
}

// Very light Markdown-to-HTML for blog posts (allows raw HTML passthrough)
export function mdToHtml(md = ''){
  let out = String(md || '')

  // Remove raw iframes; prefer directives for embeds
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')

  const youtubeIds = []
  out = out.replace(/^\s*:{2,3}youtube\s*(\{[^}]*\})?\s*$/gim, (_, attrs = '') => {
    const idMatch = /id\s*=\s*["']?([^"'\s}]+)["']?/i.exec(attrs) || /url\s*=\s*["']?([^"'\s}]+)["']?/i.exec(attrs)
    const id = extractYoutubeId(idMatch ? idMatch[1] : '')
    if (!id) return ''
    youtubeIds.push(id)
    return `@@GCYOUTUBE-${youtubeIds.length - 1}@@`
  })

  // Headings
  out = out.replace(/^######\s?(.*)$/gm, '<h6>$1</h6>')
  out = out.replace(/^#####\s?(.*)$/gm, '<h5>$1</h5>')
  out = out.replace(/^####\s?(.*)$/gm, '<h4>$1</h4>')
  out = out.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>')
  out = out.replace(/^##\s?(.*)$/gm, '<h2>$1</h2>')
  out = out.replace(/^#\s?(.*)$/gm, '<h1>$1</h1>')
  // Blockquotes
  out = out.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>')
  // Horizontal rules / thematic breaks
  out = out.replace(/^\s{0,3}(?:([-*_])( ?\1){2,})\s*$/gm, '<hr />')
  // Lists (very naive)
  out = out.replace(/^(?:- |\* )(.*)$/gm, '<li>$1</li>')
  out = out.replace(/(<li>[^<]*<\/li>\s*)+/g, m => `<ul>${m.replace(/\s*$/,'')}</ul>`) // wrap consecutive li
  // Code fences
  out = out.replace(/```([\s\S]*?)```/g, (m, g1) => `<pre><code>${escapeHtml(g1)}</code></pre>`) // fence
  // Inline code
  out = out.replace(/`([^`]+)`/g, (m, g1) => `<code>${escapeHtml(g1)}</code>`)
  // Images
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
  // Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  // Bold / Italic
  out = out.replace(/\*\*\*([^\*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  out = out.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>')

  // Replace youtube placeholders with responsive embeds
  out = out.replace(/@@GCYOUTUBE-(\d+)@@/g, (m, idxStr) => {
    const id = youtubeIds[Number(idxStr)]
    if (!id) return ''
    const safeId = escapeHtml(id)
    return `<div class="gc-embed gc-embed--youtube"><div class="gc-embed__ratio"><iframe src="https://www.youtube.com/embed/${safeId}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></div>`
  })

  // Paragraphs: wrap loose lines that are not already block-level
  out = out.split(/\n{2,}/).map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (/^\s*<(h\d|ul|ol|li|pre|blockquote|img|iframe|p|table|hr|div)/i.test(trimmed)) return trimmed
    return `<p>${trimmed.replace(/\n/g,'<br/>')}</p>`
  }).join('\n')
  return out
}

function escapeHtml(s = ''){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
