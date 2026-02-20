import { describe, expect, it } from 'vitest'
import { normalizeSongbookTitle } from '../ingest.js'

describe('normalizeSongbookTitle', () => {
  it('converts uppercase english titles to title case', () => {
    expect(normalizeSongbookTitle('ABBA FATHER', 'en')).toBe('Abba Father')
    expect(normalizeSongbookTitle("THE LORD'S PRAYER", 'en')).toBe("The Lord's Prayer")
    expect(normalizeSongbookTitle('FOR WHO YOU ARE', 'en')).toBe('For Who You Are')
  })

  it('normalizes Turkish casing with locale-aware rules', () => {
    expect(normalizeSongbookTitle('RAB’BİN DUASI', 'tr')).toBe('Rab’bin Duası')
    expect(normalizeSongbookTitle('YÜCE KRALLARIN KRALI', 'tr')).toBe('Yüce Kralların Kralı')
  })
})
