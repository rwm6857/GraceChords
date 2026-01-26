import { classifyLine, headingToDirective } from './classify.js'
import { normalizeChordLine } from './chords.js'

export type NormalizeOptions = {
  title?: string
}

function normalizeOcrArtifacts(line: string): string {
  const parts = line.split(/(\[[^\]]+\])/g)
  const normalized = parts.map((part) => {
    if (part.startsWith('[') && part.endsWith(']')) return part
    return part
      .replace(/\u00ad/g, '')
      .replace(/[~]+/g, '')
      .replace(/([A-Za-z0-9'’])\s*[-‐‑‒–—]\s*([A-Za-z0-9'’])/g, '$1$2')
      .replace(/\s{2,}/g, ' ')
  })
  return normalized.join('')
}

function capitalizeFirstAlpha(line: string): string {
  const chars = line.split('')
  let inChord = false
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i]
    if (char === '[') {
      inChord = true
      continue
    }
    if (char === ']') {
      inChord = false
      continue
    }
    if (inChord) continue
    if (/[a-z]/.test(char)) {
      chars[i] = char.toUpperCase()
      break
    }
    if (/[A-Z]/.test(char)) {
      break
    }
  }
  return chars.join('')
}

function isSectionDirective(body: string): boolean {
  const token = body.split(/\s+/)[0].toLowerCase()
  const base = token.split(':')[0]
  return (
    base.startsWith('so') ||
    base.startsWith('start_of_') ||
    base.startsWith('end_of_') ||
    ['sov', 'soc', 'sob', 'sot', 'soi', 'soo', 'sop', 'eov', 'eoc', 'eob', 'eot', 'eoi', 'eoo', 'eop'].includes(base)
  )
}

export function normalizeChordPro(input: string, options: NormalizeOptions = {}): string {
  const lines = input.split(/\r?\n/)
  const output: string[] = []

  let hasTitle = false
  let openSection: { end: string } | null = null
  let capitalizeNext = true

  const closeSection = () => {
    if (openSection) {
      output.push(openSection.end)
      openSection = null
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    const directiveMatch = line.match(/^\{([^}]+)\}$/)
    if (directiveMatch) {
      const body = directiveMatch[1]
      if (/^title\s*:/i.test(body)) {
        hasTitle = true
      }
      output.push(`{${body}}`)
      if (isSectionDirective(body)) {
        capitalizeNext = true
      }
      continue
    }

    const cleaned = normalizeOcrArtifacts(line)
    const lineType = classifyLine(cleaned)
    if (lineType === 'heading') {
      closeSection()
      const directive = headingToDirective(line)
      if (directive) {
        output.push(directive.start)
        openSection = { end: directive.end }
        capitalizeNext = true
        continue
      }
    }

    if (lineType === 'blank') {
      closeSection()
      output.push('')
      capitalizeNext = true
      continue
    }

    let normalizedLine = normalizeChordLine(cleaned)
    if (capitalizeNext) {
      normalizedLine = capitalizeFirstAlpha(normalizedLine)
    }
    output.push(normalizedLine)
    capitalizeNext = false
  }

  closeSection()

  if (!hasTitle) {
    const title = options.title || 'Untitled'
    output.unshift(`{title: ${title}}`)
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n'
}
