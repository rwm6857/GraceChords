// Block and span parsing, shared by the CCEL parser and the hand-authored
// content merge so both sources produce byte-identical structure and render
// identically by construction.
//
// The renderer must never parse markup at runtime: three platforms would each
// need a parser and all three would have to agree. The parse happens here, once.

/** A run of body text. `i` marks italic. */
// (type documented in packages/core/src/devotional/types.ts)

/**
 * Split text on the transcription's markdown-style `_italic_` markers.
 *
 * `04-14-PM` carries the corpus's only unbalanced markers — a doubled
 * underscore (`__well upon divine`), a genuine defect in the CCEL
 * transcription. Collapsing runs of underscores to one rebalances it, so the
 * naive toggle below stays correct and no entry emits a stray italic run.
 * Verified by the bodyPlain round-trip: collapsing then dropping every marker
 * yields exactly the text with all underscores removed.
 */
export function spansFromText(text) {
  const parts = String(text).replace(/_{2,}/g, '_').split('_')
  const spans = []
  parts.forEach((t, i) => {
    if (!t) return
    spans.push(i % 2 ? { t, i: true } : { t })
  })
  return spans.length ? spans : [{ t: '' }]
}

/**
 * Convert `{ type, text }` blocks into the shipped `bodyBlocks` shape.
 *
 * Two deliberate deviations from the brief's sketch, both because the corpus
 * genuinely needs them:
 *
 *  - Verse lines carry `spans`, not plain strings. 2 of the 145 verse blocks
 *    contain italic markers, and plain strings would surface those as literal
 *    underscores on screen.
 *  - Verse lines carry `indent`. 5 entries use relative indentation inside a
 *    stanza — hanging continuation lines and centered inscriptions. Trimming it
 *    away is lossy and breaks the bodyPlain round-trip; storing it keeps the
 *    artifact exact while leaving the renderer free to ignore it and centre.
 */
export function toBodyBlocks(blocks) {
  return blocks.map((b) => {
    if (b.type !== 'verse') return { type: 'p', spans: spansFromText(b.text) }
    const lines = b.text.split('\n').map((raw) => {
      const line = raw.replace(/\s+$/, '')
      const indent = line.length - line.replace(/^ +/, '').length
      return { indent, spans: spansFromText(line.slice(indent)) }
    })
    return { type: 'verse', lines }
  })
}

const spansToText = (spans) => spans.map((s) => s.t).join('')

/**
 * Reassemble `bodyBlocks` back to plain text. The guard against a block or span
 * parser silently dropping a sentence: this must equal `bodyPlain` EXACTLY, so
 * it is deliberately whitespace-exact rather than normalized.
 */
export function bodyBlocksToPlain(bodyBlocks) {
  return bodyBlocks
    .map((b) =>
      b.type === 'verse'
        ? b.lines.map((l) => ' '.repeat(l.indent) + spansToText(l.spans)).join('\n')
        : spansToText(b.spans)
    )
    .join('\n\n')
}

/** Plain text of one block, for excerpts. */
export function blockToPlain(block) {
  if (block.type === 'verse') return block.lines.map((l) => spansToText(l.spans)).join('\n')
  return spansToText(block.spans)
}

/**
 * Parse an authored markdown body into `{ type, text }` blocks, using the same
 * conventions as the CCEL corpus: blank lines separate blocks, and a block
 * whose every line is indented is a verse/hymn stanza rather than prose.
 * Prose lines are unwrapped onto one line; verse lines stay discrete.
 */
export function parseAuthoredBody(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n')
  const groups = []
  let cur = []
  for (const line of lines) {
    if (line.trim()) cur.push(line)
    else if (cur.length) { groups.push(cur); cur = [] }
  }
  if (cur.length) groups.push(cur)

  return groups.map((group) => {
    const indents = group.map((l) => l.length - l.replace(/^ +/, '').length)
    const minIndent = Math.min(...indents)
    const isVerse = minIndent >= 2 && (group.length >= 2 || minIndent >= 5)
    if (isVerse) {
      return { type: 'verse', text: group.map((l) => l.slice(minIndent).trimEnd()).join('\n') }
    }
    // Prose: join hard-wrapped lines. An end-of-line hyphen is a real
    // hyphenated compound broken across lines, so the lines join with no space.
    let out = ''
    for (const raw of group) {
      const line = raw.trim()
      if (!out) { out = line; continue }
      out += /[-]$/.test(out) ? line : ` ${line}`
    }
    return { type: 'p', text: out }
  })
}

/**
 * Minimal YAML-ish frontmatter reader — deliberately hand-rolled rather than a
 * new dependency. Supports `key: value` with optional single/double quotes, and
 * ignores blank lines and `#` comments. No nesting, no lists: the authored
 * schema needs none.
 */
export function parseFrontmatter(source) {
  const text = String(source).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { data: {}, body: text, hadFrontmatter: false }

  const data = {}
  for (const raw of m[1].split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    if (key) data[key] = value
  }
  return { data, body: text.slice(m[0].length), hadFrontmatter: true }
}
