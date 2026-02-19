import { describe, expect, it } from 'vitest'
import { splitSongbookLines } from '../utils/songbook.js'
import type { ExtractedLine } from '../utils/types.js'

function line(text: string, page: number): ExtractedLine {
  return { text, page, source: 'pdf' }
}

describe('splitSongbookLines', () => {
  it('splits bilingual song pages and ignores non-song cover/toc pages', () => {
    const lines: ExtractedLine[] = [
      line('ÖZEL BASKI - SPECIAL EDITION', 1),
      line('CONTENTS', 1),
      line('1', 1),
      line('English Songs', 1),
      line('[Kıta]', 2),
      line('E C#m', 2),
      line('Abba baba Abba baba', 2),
      line('1. ABBA BABA', 2),
      line('(TK) - (EN)', 2),
      line('1. ABBA FATHER', 3),
      line('[Verse]', 3),
      line('E C#m', 3),
      line('Abba Father Abba Father', 3),
      line('[Kıta]', 4),
      line('D G A', 4),
      line('Acılar adamıydı ele verildi', 4),
      line('2. ACILAR ADAMI', 4),
      line('(TK) - (EN)', 4),
      line('2. MAN OF SORROWS', 5),
      line('[Verse]', 5),
      line('D G A', 5),
      line('Man of sorrows Lamb of God', 5)
    ]

    const songs = splitSongbookLines(lines)
    const titles = songs.map((song) => `${song.number}:${song.title}`)

    expect(titles).toContain('1:ABBA BABA')
    expect(titles).toContain('1:ABBA FATHER')
    expect(titles).toContain('2:ACILAR ADAMI')
    expect(titles).toContain('2:MAN OF SORROWS')

    const trSong = songs.find((song) => song.number === 1 && song.title === 'ABBA BABA')
    const enSong = songs.find((song) => song.number === 1 && song.title === 'ABBA FATHER')
    expect(trSong?.lines.map((entry) => entry.text).join('\n')).toContain('Abba baba')
    expect(trSong?.lines.map((entry) => entry.text).join('\n')).not.toContain('Abba Father')
    expect(enSong?.lines.map((entry) => entry.text).join('\n')).toContain('Abba Father')
    expect(enSong?.lines.map((entry) => entry.text).join('\n')).not.toContain('Abba baba')
  })

  it('keeps continuation lines with the previous song when a new marker appears mid-page', () => {
    const lines: ExtractedLine[] = [
      line('5. BABA SENİN SEVGİN', 16),
      line('Em D', 16),
      line('Baba Senin sevgin çok derin', 16),
      line('G D', 17),
      line('Kalbim eğilir, dizim çöker', 17),
      line('[Nakarat]', 17),
      line('6. BANA TEMİZ ELLER', 17),
      line('6. GIVE US CLEAN HANDS', 17),
      line('[Verse]', 17),
      line('G D/F#', 17),
      line('We bow our hearts, we bend our knees', 17)
    ]

    const songs = splitSongbookLines(lines)
    const song5 = songs.find((song) => song.number === 5)
    const song6en = songs.find((song) => song.number === 6 && song.title === 'GIVE US CLEAN HANDS')

    expect(song5).toBeTruthy()
    expect(song5?.lines.map((entry) => entry.text).join('\n')).toContain('Kalbim eğilir')
    expect(song5?.lines.map((entry) => entry.text).join('\n')).not.toContain('We bow our hearts')

    expect(song6en).toBeTruthy()
    expect(song6en?.lines.map((entry) => entry.text).join('\n')).toContain('We bow our hearts')
  })

  it('handles english title markers that appear at the end of a page section', () => {
    const lines: ExtractedLine[] = [
      line('3. AVLULARINA AL BENİ', 12),
      line('Em Cmaj7', 12),
      line('Avlularına al beni', 12),
      line('(TK) - (EN)', 12),
      line('Em Cmaj7', 13),
      line('Take me past the outer courts', 13),
      line('3. TAKE ME IN (HOLY OF HOLIES)', 13),
      line('4. BABA SEN İYİSİN', 14),
      line('G C', 14),
      line('Neler neler anlattılar', 14)
    ]

    const songs = splitSongbookLines(lines)
    const song3en = songs.find((song) => song.number === 3 && song.title === 'TAKE ME IN (HOLY OF HOLIES)')
    const song3tr = songs.find((song) => song.number === 3 && song.title === 'AVLULARINA AL BENİ')

    expect(song3en).toBeTruthy()
    expect(song3en?.lines.map((entry) => entry.text).join('\n')).toContain('Take me past the outer courts')
    expect(song3tr).toBeTruthy()
    expect(song3tr?.lines.map((entry) => entry.text).join('\n')).toContain('Avlularına al beni')
  })
})
