import { describe, expect, it } from 'vitest'
import { extractPdfHeader } from '../utils/pdfHeader.js'

const makeLine = (text: string) => ({ text })

describe('extractPdfHeader', () => {
  it('extracts title and key from leading pdf header lines', () => {
    const lines = [
      makeLine('Above All'),
      makeLine('(Key of A)'),
      makeLine('C   D'),
      makeLine('Above all powers')
    ]

    const result = extractPdfHeader(lines)
    expect(result.title).toBe('Above All')
    expect(result.key).toBe('A')
    expect(result.lines.map((line) => line.text)).toEqual(['C   D', 'Above all powers'])
  })

  it('ignores website headers and footers', () => {
    const lines = [
      makeLine('pnwchords.com'),
      makeLine('Above All'),
      makeLine('(Key of A)'),
      makeLine('C   D'),
      makeLine('Above all powers'),
      makeLine('www.pnwchords.com')
    ]

    const result = extractPdfHeader(lines)
    expect(result.title).toBe('Above All')
    expect(result.key).toBe('A')
    expect(result.lines.map((line) => line.text)).toEqual(['C   D', 'Above all powers'])
  })
})
