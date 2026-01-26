import { classifyLine } from './classify.js'
import type { ExtractedLine } from './types.js'

export type PdfHeaderResult = {
  lines: ExtractedLine[]
  title?: string
  key?: string
}

const KEY_RE = /^\(\s*Key of\s+([A-G][b#]?)\s*\)$/i
const URL_RE = /(https?:\/\/|www\.)\S+/i
const DOMAIN_RE = /\b[a-z0-9-]+\.(com|org|net|church|co|io|us|info|ca|uk|gov|edu)\b/i
const EMAIL_RE = /\b\S+@\S+\.[A-Za-z]{2,}\b/
const PAGE_RE = /^\s*page\s*\d+(\s*of\s*\d+)?\s*$/i
const COPYRIGHT_RE = /(©|copyright|all rights reserved)/i

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
  let title: string | undefined
  let key: string | undefined

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
    for (let i = titleIndex + 1; i < filteredLines.length; i += 1) {
      const text = filteredLines[i].text.trim()
      if (!text) continue
      const match = text.match(KEY_RE)
      if (match) {
        keyIndex = i
        key = match[1].toUpperCase()
      }
      break
    }
  }

  if (titleIndex === -1 && keyIndex === -1) {
    return { lines: filteredLines }
  }

  const trimmed = filteredLines.filter((_, index) => index !== titleIndex && index !== keyIndex)
  return { lines: trimmed, title, key }
}
