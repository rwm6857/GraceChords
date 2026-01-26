import { basename, extname } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { readText } from '../utils/fs.js'
import { classifyLine } from '../utils/classify.js'
import type { ExtractionResult } from '../utils/types.js'

type OpenSongMeta = {
  title?: string
  authors?: string[]
  key?: string
  presentation?: string
  hasChords?: boolean
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function stripChordDots(line: string): string {
  return line.replace(
    /([A-G](?:#|b)?(?:m|maj|maj7|dim|aug|sus2|sus4|add9|[0-9]*)?(?:\/[A-G](?:#|b)?)?)\./g,
    '$1'
  )
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === 'string' ? [entry] : []))
  }
  if (typeof value === 'string') return [value]
  return []
}

function cleanLine(line: string): string {
  const decoded = decodeEntities(line)
  if (/^\s*\[[^\]]+\]\s*$/.test(decoded)) {
    return decoded.trim()
  }
  if (!decoded.trim()) return ''
  let cleaned = decoded
  const hadLeadingDot = /^\s*\./.test(cleaned)
  cleaned = cleaned.replace(/^\s*\.\s*/, '')
  cleaned = cleaned.replace(/^\s*\/\/\s*/, '').replace(/\s*\/\/\s*$/, '')
  cleaned = cleaned.replace(/_+/g, '')
  cleaned = cleaned.replace(/~+/g, '')
  cleaned = stripChordDots(cleaned)
  cleaned = cleaned.trim()
  return cleaned
}

function fallbackTitleFromPath(path: string): string {
  const name = basename(path, extname(path))
  return name.replace(/[_-]+/g, ' ').trim() || name
}

function parseLyricsBlock(raw: string): string[] {
  return raw.split(/\r?\n/).map((line) => cleanLine(line))
}

function extractLyricsValue(lyrics: unknown): string {
  if (typeof lyrics === 'string') return lyrics
  if (lyrics && typeof lyrics === 'object') {
    const textValue =
      (lyrics as Record<string, unknown>)['#text'] ||
      (lyrics as Record<string, unknown>)['text'] ||
      (lyrics as Record<string, unknown>)['__cdata']
    if (typeof textValue === 'string') return textValue
  }
  return ''
}

export function isOpenSongXml(content: string): boolean {
  const sample = content.slice(0, 5000)
  return /^\s*<\?xml/i.test(sample) || (/<song[\s>]/i.test(sample) && /<lyrics[\s>]/i.test(sample))
}

export async function extractOpenSong(filePath: string): Promise<ExtractionResult> {
  const raw = await readText(filePath)
  const warnings: string[] = []
  let meta: OpenSongMeta = {}
  let lyricLines: string[] = []

  try {
    const parser = new XMLParser({
      ignoreAttributes: true,
      trimValues: false,
      parseTagValue: false
    })
    const parsed = parser.parse(raw)
    const song = parsed?.song || parsed?.Song || parsed?.SONG

    if (!song) {
      warnings.push('OpenSong XML missing <song> root.')
    } else {
      const title = typeof song.title === 'string' ? decodeEntities(song.title.trim()) : undefined
      const authors = toArray(song.author).map((author) => decodeEntities(author.trim())).filter(Boolean)
      const key = typeof song.key === 'string' ? decodeEntities(song.key.trim()) : undefined
      const presentation =
        typeof song.presentation === 'string' ? decodeEntities(song.presentation.trim()) : undefined
      const lyricsRaw = extractLyricsValue(song.lyrics)

      meta = {
        title,
        authors: authors.length > 0 ? authors : undefined,
        key,
        presentation
      }

      if (lyricsRaw) {
        lyricLines = parseLyricsBlock(lyricsRaw)
      } else {
        warnings.push('OpenSong XML missing <lyrics> content.')
      }
    }
  } catch (error) {
    warnings.push(`OpenSong XML parse failed: ${(error as Error).message}`)
  }

  if (!meta.title) {
    meta.title = fallbackTitleFromPath(filePath)
  }

  meta.hasChords =
    lyricLines.find((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (/^\[[^\]]+\]$/.test(trimmed)) return false
      if (/\[[^\]]+\]/.test(trimmed)) return true
      return classifyLine(trimmed) === 'chords'
    }) !== undefined

  const lines = lyricLines.map((text) => ({ text, source: 'opensong' }))
  return {
    lines,
    warnings,
    stats: {},
    extractor: 'opensong',
    meta
  }
}
