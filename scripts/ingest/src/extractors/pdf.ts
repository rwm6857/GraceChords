import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtractionResult, ExtractedLine, WordBox } from '../utils/types.js'
import { extractFromImage } from './image.js'

function groupWordsIntoLines(words: WordBox[]): ExtractedLine[] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: { y: number; words: WordBox[] }[] = []
  const threshold = 8

  for (const word of sorted) {
    const last = lines[lines.length - 1]
    if (!last || Math.abs(word.y - last.y) > threshold) {
      lines.push({ y: word.y, words: [word] })
    } else {
      last.words.push(word)
    }
  }

  return lines.map((line) => {
    const wordsSorted = line.words.sort((a, b) => a.x - b.x)
    const text = wordsSorted.map((w) => w.text).join(' ')
    return { text, y: line.y, words: wordsSorted, source: 'pdf' }
  })
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
      const offset = index * 10000
      result.lines.forEach((line) => {
        lines.push({ ...line, y: (line.y || 0) + offset, source: 'pdf-ocr' })
      })
      if (typeof result.stats.ocrConfidenceAvg === 'number') {
        confSum += result.stats.ocrConfidenceAvg
        confCount += 1
      }
      warnings.push(...result.warnings)
    }

    return {
      lines,
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
