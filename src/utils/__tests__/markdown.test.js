import { describe, it, expect } from 'vitest'
import { parseFrontmatter, mdToHtml, stripMarkdown, slugifyKebab } from '../../utils/markdown'

describe('markdown utils', () => {
  it('parseFrontmatter extracts meta and content', () => {
    const md = `---
title: "Leading Worship with Confidence"
author: "Ryan Moore"
date: "2025-09-10"
tags: ["leadership", "vocals", "confidence"]
summary: "Practical tips."
---

# Leading Worship with Confidence

Body here.`
    const { meta, content } = parseFrontmatter(md)
    expect(meta.title).toBe('Leading Worship with Confidence')
    expect(meta.author).toBe('Ryan Moore')
    expect(meta.date).toBe('2025-09-10')
    expect(Array.isArray(meta.tags)).toBe(true)
    expect(meta.tags).toEqual(['leadership','vocals','confidence'])
    expect(meta.summary).toBe('Practical tips.')
    expect(content.trim().startsWith('# Leading Worship with Confidence')).toBe(true)
  })

  it('mdToHtml converts basic markdown constructs', () => {
    const md = `## Header\n\n- Item 1\n- Item 2\n\n> A quote\n\n[Link](https://example.com) and ![Alt](img.png)\n\n\`inline\`\n\n\`\`\`\ncode block\n\`\`\``
    const html = mdToHtml(md)
    expect(html).toContain('<h2>Header</h2>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>Item 1</li>')
    expect(html).toContain('<blockquote>A quote</blockquote>')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('<img alt="Alt" src="img.png"')
    expect(html).toContain('<code>inline</code>')
    expect(html).toContain('<pre><code>code block</code></pre>')
  })

  it('stripMarkdown produces readable plain text', () => {
    const md = `# Title\n\nText with [link](https://x.y) and image ![alt](a.png).\n\n> Quote`
    const txt = stripMarkdown(md)
    expect(txt.toLowerCase()).toContain('title')
    expect(txt.toLowerCase()).toContain('text with')
    expect(txt.toLowerCase()).toContain('quote')
    expect(txt).not.toMatch(/\[[^\]]+\]\([^)]*\)/) // no links remain
    expect(txt).not.toMatch(/!\[[^\]]*\]\([^)]*\)/) // no images remain
  })

  it('slugifyKebab converts titles to stable slugs', () => {
    expect(slugifyKebab('Leading Worship with Confidence!')).toBe('leading-worship-with-confidence')
    expect(slugifyKebab('I’ll Always Love You')).toBe('i-ll-always-love-you')
    expect(slugifyKebab('Názaré – São Paulo')).toBe('nazare-sao-paulo')
  })
})

