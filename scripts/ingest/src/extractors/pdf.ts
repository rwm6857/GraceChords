import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtractionResult, ExtractedLine, WordBox } from '../utils/types.js'
import { extractFromImage } from './image.js'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function insertBlankLinesForGaps(lines: ExtractedLine[]): ExtractedLine[] {
  if (lines.length < 2) return lines
  const gaps: number[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const prev = lines[i - 1]
    const next = lines[i]
    if (prev.page !== undefined && next.page !== undefined && prev.page !== next.page) continue
    if (typeof prev.y !== 'number' || typeof next.y !== 'number') continue
    const gap = next.y - prev.y
    if (gap > 0) gaps.push(gap)
  }
  const typicalGap = median(gaps)
  if (!typicalGap) return lines
  const threshold = Math.max(typicalGap * 1.6, 12)

  const output: ExtractedLine[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    output.push(current)
    const next = lines[i + 1]
    if (!next) continue
    if (current.page !== undefined && next.page !== undefined && current.page !== next.page) continue
    if (typeof current.y !== 'number' || typeof next.y !== 'number') continue
    const gap = next.y - current.y
    if (gap > threshold && gap < typicalGap * 6) {
      output.push({
        text: '',
        y: current.y + gap / 2,
        source: current.source,
        page: current.page
      })
    }
  }
  return output
}

function groupWordsIntoLines(words: WordBox[]): ExtractedLine[] {
  const sorted = [...words].sort(
    (a, b) => (a.page || 1) - (b.page || 1) || a.y - b.y || a.x - b.x
  )
  const lines: { page: number; y: number; words: WordBox[] }[] = []
  const threshold = 8

  for (const word of sorted) {
    const page = word.page || 1
    const last = lines[lines.length - 1]
    if (!last || page !== last.page || Math.abs(word.y - last.y) > threshold) {
      lines.push({ page, y: word.y, words: [word] })
    } else {
      last.words.push(word)
    }
  }

  const assembled = lines.map((line) => {
    const wordsSorted = line.words.sort((a, b) => a.x - b.x)
    const text = wordsSorted.map((w) => w.text).join(' ')
    return { text, y: line.y, words: wordsSorted, source: 'pdf', page: line.page }
  })
  return insertBlankLinesForGaps(assembled)
}

async function runPython(pdfPath: string): Promise<WordBox[]> {
  const tempDir = await mkdtemp(join(tmpdir(), 'gc-ingest-'))
  const outputPath = join(tempDir, 'pdf.json')
  const scriptPath = fileURLToPath(new URL('../../python/pdf_extract.py', import.meta.url))

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('python3', [scriptPath, pdfPath, outputPath], {
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error('python pdf extraction failed'))
    })
  })

  const raw = await readFile(outputPath, 'utf8')
  await rm(tempDir, { recursive: true, force: true })

  const data = JSON.parse(raw)
  return data.words || []
}

async function runPythonRender(pdfPath: string, outputDir: string): Promise<void> {
  const scriptPath = fileURLToPath(new URL('../../python/pdf_render.py', import.meta.url))
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('python3', [scriptPath, pdfPath, outputDir], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error('python pdf render failed'))
    })
  })
}

async function extractFromPdfOcr(path: string, warnings: string[]): Promise<ExtractionResult> {
  const tempDir = await mkdtemp(join(tmpdir(), 'gc-ingest-ocr-'))
  const outputDir = join(tempDir, 'pages')
  try {
    await runPythonRender(path, outputDir)
    const files = (await readdir(outputDir))
      .filter((file) => file.toLowerCase().endsWith('.png'))
      .sort()

    if (files.length === 0) {
      warnings.push('No rendered pages found for OCR.')
      return { lines: [], warnings, stats: {}, extractor: 'pdf-ocr' }
    }

    const lines: ExtractedLine[] = []
    let confSum = 0
    let confCount = 0

    for (let index = 0; index < files.length; index += 1) {
      const filePath = join(outputDir, files[index])
      const result = await extractFromImage(filePath)
      result.lines.forEach((line) => {
        lines.push({ ...line, page: index + 1, source: 'pdf-ocr' })
      })
      if (typeof result.stats.ocrConfidenceAvg === 'number') {
        confSum += result.stats.ocrConfidenceAvg
        confCount += 1
      }
      warnings.push(...result.warnings)
    }

    return {
      lines: insertBlankLinesForGaps(lines),
      warnings,
      stats: { ocrConfidenceAvg: confCount > 0 ? confSum / confCount : undefined },
      extractor: 'pdf-ocr'
    }
  } catch (error) {
    warnings.push('Python PDF render unavailable. Install python3 + pymupdf for OCR fallback.')
    return { lines: [], warnings, stats: {}, extractor: 'pdf-ocr' }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function extractFromPdf(path: string): Promise<ExtractionResult> {
  const warnings: string[] = []
  try {
    const words = await runPython(path)
    if (words.length > 0) {
      const lines = groupWordsIntoLines(words)
      return {
        lines,
        warnings,
        stats: {},
        extractor: 'pdf'
      }
    }
    warnings.push('No text extracted; attempting OCR fallback.')
  } catch (error) {
    warnings.push('Python PDF extraction unavailable. Install python3 + pdfplumber or pymupdf.')
  }

  return await extractFromPdfOcr(path, warnings)
}
