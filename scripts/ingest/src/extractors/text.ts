import { readText } from '../utils/fs.js'
import type { ExtractionResult } from '../utils/types.js'

export async function extractFromText(filePath: string): Promise<ExtractionResult> {
  const raw = await readText(filePath)
  const lines = raw.split(/\r?\n/).map((text) => ({ text, source: 'text' }))
  return {
    lines,
    warnings: [],
    stats: {},
    extractor: 'text'
  }
}
