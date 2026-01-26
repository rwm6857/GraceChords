import { spawn } from 'node:child_process'
import type { ExtractionResult, ExtractedLine, WordBox } from '../utils/types.js'

function parseTsv(tsv: string): { lines: ExtractedLine[]; ocrConfidenceAvg?: number } {
  const rows = tsv.split(/\r?\n/).slice(1)
  const map = new Map<string, WordBox[]>()
  let confSum = 0
  let confCount = 0

  for (const row of rows) {
    if (!row.trim()) continue
    const cols = row.split(/\t/)
    if (cols.length < 12) continue
    const [level, page, block, par, line, word, left, top, width, height, conf, text] = cols
    if (!text || text.trim().length === 0) continue

    const key = `${page}-${block}-${par}-${line}`
    const box: WordBox = {
      text,
      x: Number(left),
      y: Number(top),
      w: Number(width),
      h: Number(height),
      conf: Number(conf)
    }

    const list = map.get(key) || []
    list.push(box)
    map.set(key, list)

    const confNum = Number(conf)
    if (!Number.isNaN(confNum) && confNum >= 0) {
      confSum += confNum
      confCount += 1
    }
  }

  const lines: ExtractedLine[] = []
  for (const [_, words] of map.entries()) {
    const sorted = words.sort((a, b) => a.x - b.x)
    const text = sorted.map((w) => w.text).join(' ')
    lines.push({ text, words: sorted, y: sorted[0]?.y, source: 'image' })
  }

  lines.sort((a, b) => (a.y || 0) - (b.y || 0))

  return {
    lines,
    ocrConfidenceAvg: confCount > 0 ? confSum / confCount : undefined
  }
}

async function runTesseract(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn('tesseract', [path, 'stdout', '--oem', '1', '--psm', '6', 'tsv'])
    let output = ''
    let errorOutput = ''
    child.stdout.on('data', (chunk) => (output += chunk.toString()))
    child.stderr.on('data', (chunk) => (errorOutput += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(errorOutput || 'tesseract failed'))
    })
  })
}

async function runTesseractJs(path: string): Promise<ExtractionResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker()
  try {
    await worker.reinitialize('eng')
    const result = await worker.recognize(path)
    const lines = result.data.lines.map((line: any) => {
      const words: WordBox[] = line.words.map((word: any) => ({
        text: word.text,
        x: word.bbox.x0,
        y: word.bbox.y0,
        w: word.bbox.x1 - word.bbox.x0,
        h: word.bbox.y1 - word.bbox.y0,
        conf: word.confidence
      }))
      return {
        text: line.text,
        y: line.bbox.y0,
        words,
        source: 'image'
      }
    })

    return {
      lines,
      warnings: ['System tesseract not found; used tesseract.js fallback.'],
      stats: {
        ocrConfidenceAvg: result.data.words.length
          ? result.data.words.reduce((sum: number, w: any) => sum + w.confidence, 0) /
            result.data.words.length
          : undefined
      },
      extractor: 'image'
    }
  } finally {
    await worker.terminate()
  }
}

export async function extractFromImage(path: string): Promise<ExtractionResult> {
  try {
    const tsv = await runTesseract(path)
    const parsed = parseTsv(tsv)
    return {
      lines: parsed.lines,
      warnings: [],
      stats: { ocrConfidenceAvg: parsed.ocrConfidenceAvg },
      extractor: 'image'
    }
  } catch {
    return await runTesseractJs(path)
  }
}
