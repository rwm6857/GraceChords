import mammoth from 'mammoth'
import { parse } from 'node-html-parser'
import type { ExtractionResult } from '../utils/types.js'

function textFromNode(node: any): string {
  return node.text?.replace(/\s+\n/g, '\n').trim() || ''
}

function extractLinesFromHtml(html: string): string[] {
  const root = parse(html)
  const lines: string[] = []

  const walk = (node: any) => {
    if (!node) return

    if (node.tagName === 'TABLE') {
      const rows = node.querySelectorAll('tr')
      for (const row of rows) {
        const cells = row.querySelectorAll('td,th')
        const cellText = cells.map((cell: any) => cell.text.trim()).filter(Boolean)
        if (cellText.length > 0) {
          lines.push(cellText.join(' '))
        }
      }
      return
    }

    if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'LI'].includes(node.tagName)) {
      const text = textFromNode(node)
      if (text) {
        text.split(/\r?\n/).forEach((line) => {
          if (line.trim().length > 0) lines.push(line.trim())
        })
      }
      return
    }

    if (node.childNodes && node.childNodes.length > 0) {
      node.childNodes.forEach((child: any) => walk(child))
    }
  }

  root.childNodes.forEach((child: any) => walk(child))

  return lines
}

export async function extractFromDocx(path: string): Promise<ExtractionResult> {
  const result = await mammoth.convertToHtml({ path })
  const lines = extractLinesFromHtml(result.value)

  return {
    lines: lines.map((text) => ({ text, source: 'docx' })),
    warnings: [],
    stats: {},
    extractor: 'docx'
  }
}
