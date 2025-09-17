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

// Very light Markdown-to-HTML for blog posts (allows raw HTML passthrough)
export function mdToHtml(md = ''){
  let out = String(md || '')
  // Escape only angle brackets that are not starting known block HTML tags (basic heuristic)
  // Retain iframes/imgs already present in MD
  // Headings
  out = out.replace(/^######\s?(.*)$/gm, '<h6>$1</h6>')
  out = out.replace(/^#####\s?(.*)$/gm, '<h5>$1</h5>')
  out = out.replace(/^####\s?(.*)$/gm, '<h4>$1</h4>')
  out = out.replace(/^###\s?(.*)$/gm, '<h3>$1</h3>')
  out = out.replace(/^##\s?(.*)$/gm, '<h2>$1</h2>')
  out = out.replace(/^#\s?(.*)$/gm, '<h1>$1</h1>')
  // Blockquotes
  out = out.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>')
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
  // Paragraphs: wrap loose lines that are not already block-level
  out = out.split(/\n{2,}/).map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (/^\s*<(h\d|ul|ol|li|pre|blockquote|img|iframe|p|table|hr)/i.test(trimmed)) return trimmed
    return `<p>${trimmed.replace(/\n/g,'<br/>')}</p>`
  }).join('\n')
  return out
}

function escapeHtml(s = ''){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

