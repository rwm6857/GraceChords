import { classifyLine } from './classify.js'
import type { ExtractedLine } from './types.js'

export type PdfHeaderResult = {
  lines: ExtractedLine[]
  title?: string
  key?: string
  authors?: string
}

const KEY_RE = /^\(\s*Key of\s+([A-G][b#]?)\s*\)$/i
const URL_RE = /(https?:\/\/|www\.)\S+/i
const DOMAIN_RE = /\b[a-z0-9-]+\.(com|org|net|church|co|io|us|info|ca|uk|gov|edu)\b/i
const EMAIL_RE = /\b\S+@\S+\.[A-Za-z]{2,}\b/
const PAGE_RE = /^\s*page\s*\d+(\s*of\s*\d+)?\s*$/i
const COPYRIGHT_RE = /(©|copyright|all rights reserved)/i
const INTRO_INST_RE = /^(intro|inst|instrumental)(?=[^a-z]|[A-G]|$)/i

function isLikelyAuthorLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (KEY_RE.test(trimmed)) return false
  if (INTRO_INST_RE.test(trimmed)) return false
  if (classifyLine(trimmed) === 'chords') return false
  if (classifyLine(trimmed) === 'heading') return false
  if (/[{}]/.test(trimmed)) return false
  const words = trimmed.split(/\s+/)
  if (words.length < 2 || words.length > 6) return false
  const capitalized = words.filter((word) => /^[A-Z]/.test(word)).length
  if (capitalized < 2) return false
  if (/[0-9]/.test(trimmed)) return false
  return true
}

function isLikelyHeaderFooterLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (URL_RE.test(trimmed)) return true
  if (DOMAIN_RE.test(trimmed)) return true
  if (EMAIL_RE.test(trimmed)) return true
  if (PAGE_RE.test(trimmed)) return true
  if (COPYRIGHT_RE.test(trimmed)) return true
  return false
}

export function extractPdfHeader(lines: ExtractedLine[]): PdfHeaderResult {
  const filteredLines = lines.filter((line) => !isLikelyHeaderFooterLine(line.text))
  let titleIndex = -1
  let keyIndex = -1
  let authorIndex = -1
  let title: string | undefined
  let key: string | undefined
  let authors: string | undefined

  for (let i = 0; i < filteredLines.length; i += 1) {
    const text = filteredLines[i].text.trim()
    if (!text) continue

    if (
      !text.includes('{') &&
      !text.includes('}') &&
      text.length <= 80 &&
      classifyLine(text) !== 'chords'
    ) {
      titleIndex = i
      title = text
    }
    break
  }

  if (titleIndex !== -1) {
    let scanned = 0
    for (let i = titleIndex + 1; i < filteredLines.length; i += 1) {
      const text = filteredLines[i].text.trim()
      if (!text) continue
      scanned += 1
      const match = text.match(KEY_RE)
      if (match && keyIndex === -1) {
        keyIndex = i
        key = match[1].toUpperCase()
      } else if (authorIndex === -1 && isLikelyAuthorLine(text)) {
        authorIndex = i
        authors = text
      }
      if (scanned >= 4) break
    }
  }

  if (titleIndex === -1 && keyIndex === -1 && authorIndex === -1) {
    return { lines: filteredLines }
  }

  const trimmed = filteredLines.filter(
    (_, index) => index !== titleIndex && index !== keyIndex && index !== authorIndex
  )
  return { lines: trimmed, title, key, authors }
}
