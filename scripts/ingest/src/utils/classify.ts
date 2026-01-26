import { isChordToken } from './chords.js'

export type LineType = 'chords' | 'lyrics' | 'heading' | 'blank'

const HEADING_RE = /^(verse|chorus|bridge|tag|intro|outro)(\s+\d+)?[.:]?$/i

export function classifyLine(text: string): LineType {
  const trimmed = text.trim()
  if (!trimmed) return 'blank'
  if (HEADING_RE.test(trimmed)) return 'heading'

  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 0) return 'blank'

  let chordCount = 0
  let wordishCount = 0
  for (const token of tokens) {
    if (isChordToken(token)) {
      chordCount += 1
    }
    if (/[a-zA-Z]/.test(token) && !isChordToken(token)) {
      wordishCount += 1
    }
  }

  const chordRatio = chordCount / tokens.length

  if (chordCount > 0 && chordRatio >= 0.6 && wordishCount <= 2) {
    return 'chords'
  }

  return 'lyrics'
}

export function headingToDirective(heading: string): { start: string; end: string } | null {
  const trimmed = heading.trim()
  const match = trimmed.match(/^(verse|chorus|bridge|tag|intro|outro)(\s+\d+)?[.:]?$/i)
  if (!match) return null

  const label = match[1].toLowerCase()
  const number = (match[2] || '').trim()

  if (label === 'chorus') {
    return { start: '{soc}', end: '{eoc}' }
  }

  if (label === 'verse') {
    const name = number ? `Verse ${number}` : 'Verse'
    return { start: `{sov ${name}}`, end: '{eov}' }
  }

  if (label === 'bridge') {
    const name = number ? `Bridge ${number}` : 'Bridge'
    return { start: `{sob ${name}}`, end: '{eob}' }
  }

  if (label === 'intro') {
    const name = number ? `Intro ${number}` : 'Intro'
    return { start: `{soi ${name}}`, end: '{eoi}' }
  }

  if (label === 'outro') {
    const name = number ? `Outro ${number}` : 'Outro'
    return { start: `{soo ${name}}`, end: '{eoo}' }
  }

  if (label === 'tag') {
    const name = number ? `Tag ${number}` : 'Tag'
    return { start: `{sot ${name}}`, end: '{eot}' }
  }

  return null
}
