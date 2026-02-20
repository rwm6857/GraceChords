import { classifyLine, headingToDirective } from './classify.js'
import { normalizeChordLine } from './chords.js'

export type NormalizeOptions = {
  title?: string
  songId?: string
  lang?: string
  key?: string
  authors?: string
  country?: string
  tags?: string
  youtube?: string
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

function isIntroOrInstLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  return /^(intro|inst|instrumental)(?=[^a-z]|[A-G]|$)/i.test(trimmed)
}

type OpenSongSectionInfo = {
  type: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'intro' | 'outro' | 'tag'
  number?: string
}

type HeadingSectionInfo = {
  type: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'intro' | 'outro' | 'tag'
  number?: string
}

function normalizeSectionLabel(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

function sectionTypeFromLabel(rawLabel: string): HeadingSectionInfo['type'] | null {
  const label = normalizeSectionLabel(rawLabel)

  if (label === 'v' || label === 'verse' || label === 'kita') return 'verse'
  if (label === 'c' || label === 'chorus' || label === 'nakarat' || label === 'refrain') return 'chorus'
  if (label === 'b' || label === 'bridge' || label === 'kopru') return 'bridge'
  if (label === 'p' || label === 'pre' || label === 'prech' || label === 'prechorus') {
    return 'pre-chorus'
  }
  if (label === 'i' || label === 'intro' || label === 'giris') return 'intro'
  if (label === 'o' || label === 'outro' || label === 'cikis') return 'outro'
  if (label === 't' || label === 'tag') return 'tag'
  return null
}

function parseSectionToken(raw: string): { type: HeadingSectionInfo['type']; number?: string } | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let label = trimmed
  let number: string | undefined

  const separated = trimmed.match(/^(.+?)[\s.:_-]+(\d+)$/u)
  if (separated) {
    label = separated[1].trim()
    number = separated[2]
  } else {
    const compact = trimmed.match(/^([^\d]+?)(\d+)$/u)
    if (compact) {
      label = compact[1].trim()
      number = compact[2]
    }
  }

  if (!label) return null
  const type = sectionTypeFromLabel(label)
  if (!type) return null
  return { type, number }
}

function parseOpenSongSection(line: string): OpenSongSectionInfo | null {
  const trimmed = line.trim()
  const match = trimmed.match(/^\[([^\]]+)\]$/u)
  if (!match) return null
  const parsed = parseSectionToken(match[1])
  if (!parsed) return null
  return { type: parsed.type, number: parsed.number }
}

function parseHeadingSection(line: string): HeadingSectionInfo | null {
  const trimmed = line.trim()
  return parseSectionToken(trimmed)
}

function openSongSectionToDirective(
  info: OpenSongSectionInfo,
  totals: Map<string, number>,
  seen: Map<string, number>
): { start: string; end: string } {
  const total = totals.get(info.type) || 1
  const nextIndex = (seen.get(info.type) || 0) + 1
  seen.set(info.type, nextIndex)
  const number = total > 1 ? info.number || String(nextIndex) : ''

  if (info.type === 'chorus') {
    const name = number ? `Chorus ${number}` : ''
    return { start: name ? `{soc ${name}}` : '{soc}', end: '{eoc}' }
  }

  if (info.type === 'verse') {
    const name = total > 1 && number ? `Verse ${number}` : ''
    return { start: name ? `{sov ${name}}` : '{sov}', end: '{eov}' }
  }

  if (info.type === 'bridge') {
    const name = total > 1 && number ? `Bridge ${number}` : 'Bridge'
    return { start: `{sob ${name}}`, end: '{eob}' }
  }

  if (info.type === 'pre-chorus') {
    const name = total > 1 && number ? `Pre-Chorus ${number}` : 'Pre-Chorus'
    return { start: `{soc ${name}}`, end: '{eoc}' }
  }

  if (info.type === 'intro') {
    const name = total > 1 && number ? `Intro ${number}` : 'Intro'
    return { start: `{soi ${name}}`, end: '{eoi}' }
  }

  if (info.type === 'outro') {
    const name = total > 1 && number ? `Outro ${number}` : 'Outro'
    return { start: `{soo ${name}}`, end: '{eoo}' }
  }

  const name = total > 1 && number ? `Tag ${number}` : 'Tag'
  return { start: `{sot ${name}}`, end: '{eot}' }
}

function headingSectionToDirective(
  info: HeadingSectionInfo,
  totals: Map<string, number>,
  seen: Map<string, number>
): { start: string; end: string } {
  const total = totals.get(info.type) || 1
  const nextIndex = (seen.get(info.type) || 0) + 1
  seen.set(info.type, nextIndex)
  const number = total > 1 ? info.number || String(nextIndex) : ''

  if (info.type === 'chorus') {
    const name = number ? `Chorus ${number}` : ''
    return { start: name ? `{soc ${name}}` : '{soc}', end: '{eoc}' }
  }

  if (info.type === 'verse') {
    const name = number ? `Verse ${number}` : ''
    return { start: name ? `{sov ${name}}` : '{sov}', end: '{eov}' }
  }

  if (info.type === 'bridge') {
    const name = number ? `Bridge ${number}` : 'Bridge'
    return { start: `{sob ${name}}`, end: '{eob}' }
  }

  if (info.type === 'pre-chorus') {
    const name = number ? `Pre-Chorus ${number}` : 'Pre-Chorus'
    return { start: `{soc ${name}}`, end: '{eoc}' }
  }

  if (info.type === 'intro') {
    const name = number ? `Intro ${number}` : 'Intro'
    return { start: `{soi ${name}}`, end: '{eoi}' }
  }

  if (info.type === 'outro') {
    const name = number ? `Outro ${number}` : 'Outro'
    return { start: `{soo ${name}}`, end: '{eoo}' }
  }

  const name = number ? `Tag ${number}` : 'Tag'
  return { start: `{sot ${name}}`, end: '{eot}' }
}

export function normalizeChordPro(input: string, options: NormalizeOptions = {}): string {
  const lines = input.split(/\r?\n/)
  const output: string[] = []

  const meta = {
    title: options.title || '',
    songId: options.songId || '',
    lang: options.lang || '',
    key: options.key || '',
    authors: options.authors || '',
    country: options.country || '',
    tags: options.tags || '',
    youtube: options.youtube || ''
  }

  let hasTitle = false
  let openSection: { end: string; hasContent: boolean } | null = null
  let capitalizeNext = true
  const openSongTotals = new Map<string, number>()
  const openSongSeen = new Map<string, number>()
  const headingTotals = new Map<string, number>()
  const headingSeen = new Map<string, number>()

  const closeSection = (options: { final?: boolean } = {}) => {
    if (openSection) {
      if (!options.final) {
        if (output.length > 0 && output[output.length - 1] !== '') {
          output.push('')
        }
      }
      output.push(openSection.end)
      openSection = null
      return true
    }
    return false
  }

  const isSectionStartLine = (raw: string): boolean => {
    const trimmed = raw.trim()
    if (!trimmed) return false
    const directiveMatch = trimmed.match(/^\{([^}]+)\}$/)
    if (directiveMatch && isSectionDirective(directiveMatch[1].trim())) return true
    if (parseHeadingSection(trimmed)) return true
    if (parseOpenSongSection(trimmed)) return true
    return false
  }

  for (const rawLine of lines) {
    const info = parseOpenSongSection(rawLine.trim())
    if (info) {
      openSongTotals.set(info.type, (openSongTotals.get(info.type) || 0) + 1)
    }
    const headingInfo = parseHeadingSection(rawLine.trim())
    if (headingInfo) {
      headingTotals.set(headingInfo.type, (headingTotals.get(headingInfo.type) || 0) + 1)
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex]
    const line = rawLine.trimEnd()

    const directiveMatch = line.match(/^\{([^}]+)\}$/)
    if (directiveMatch) {
      const body = directiveMatch[1].trim()
      const [rawKey, ...rest] = body.split(':')
      const key = rawKey.trim().toLowerCase()
      const value = rest.join(':').trim()

      if (key === 'title') {
        if (!options.title && value) meta.title = value
        hasTitle = true
        continue
      }
      if (key === 'song_id' || key === 'songid' || key === 'translation_group' || key === 'translationgroup') {
        if (!options.songId && value) meta.songId = value
        continue
      }
      if (key === 'lang' || key === 'language' || key === 'locale') {
        if (!options.lang && value) meta.lang = value
        continue
      }
      if (key === 'key') {
        if (!options.key && value) meta.key = value
        continue
      }
      if (key === 'authors' || key === 'artist') {
        if (!options.authors && value) meta.authors = value
        continue
      }
      if (key === 'country') {
        if (!options.country && value) meta.country = value
        continue
      }
      if (key === 'tags' || key === 'tag') {
        if (!options.tags && value) meta.tags = value
        continue
      }
      if (key === 'youtube') {
        if (!options.youtube && value) meta.youtube = value
        continue
      }

      output.push(`{${body}}`)
      if (isSectionDirective(body)) {
        capitalizeNext = true
      }
      continue
    }

    const openSongInfo = parseOpenSongSection(line)
    if (openSongInfo) {
      const openSongDirective = openSongSectionToDirective(openSongInfo, openSongTotals, openSongSeen)
      closeSection()
      output.push(openSongDirective.start)
      openSection = { end: openSongDirective.end, hasContent: false }
      capitalizeNext = true
      continue
    }

    const cleaned = normalizeOcrArtifacts(line)
    if (isIntroOrInstLine(cleaned)) {
      continue
    }
    const headingInfo = parseHeadingSection(line)
    if (headingInfo) {
      closeSection()
      const directive = headingSectionToDirective(headingInfo, headingTotals, headingSeen)
      output.push(directive.start)
      openSection = { end: directive.end, hasContent: false }
      capitalizeNext = true
      continue
    }

    const lineType = classifyLine(cleaned)
    if (lineType === 'heading') {
      closeSection()
      const directive = headingToDirective(line)
      if (!directive) continue
      output.push(directive.start)
      openSection = { end: directive.end, hasContent: false }
      capitalizeNext = true
      continue
    }

    if (lineType === 'blank') {
      let nextIndex = -1
      for (let j = lineIndex + 1; j < lines.length; j += 1) {
        if (lines[j].trim().length > 0) {
          nextIndex = j
          break
        }
      }
      if (nextIndex === -1) {
        const closed = closeSection({ final: true })
        if (!closed) output.push('')
        capitalizeNext = true
        continue
      }
      if (openSection && isSectionStartLine(lines[nextIndex])) {
        closeSection()
        capitalizeNext = true
        continue
      }
      if (!openSection || openSection.hasContent) {
        output.push('')
      }
      capitalizeNext = true
      continue
    }

    let normalizedLine = normalizeChordLine(cleaned)
    if (capitalizeNext) {
      normalizedLine = capitalizeFirstAlpha(normalizedLine)
    }
    output.push(normalizedLine)
    if (openSection) {
      openSection.hasContent = true
    }
    capitalizeNext = false
  }

  closeSection({ final: true })

  const headerLines = [
    `{title: ${meta.title}}`,
    ...(meta.songId ? [`{song_id: ${meta.songId}}`] : []),
    ...(meta.lang ? [`{lang: ${meta.lang}}`] : []),
    `{key: ${meta.key}}`,
    `{authors: ${meta.authors}}`,
    `{country: ${meta.country}}`,
    `{tags: ${meta.tags}}`,
    `{youtube: ${meta.youtube}}`
  ]

  output.unshift(...headerLines, '')

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n'
}
