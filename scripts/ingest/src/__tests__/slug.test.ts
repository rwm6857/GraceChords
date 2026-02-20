import { describe, expect, it } from 'vitest'
import { slugifyTitle } from '../utils/slug.js'

describe('slugifyTitle', () => {
  it('lowercases and underscores', () => {
    expect(slugifyTitle('Amazing Grace')).toBe('amazing_grace')
  })

  it('strips extension', () => {
    expect(slugifyTitle('my_song.docx')).toBe('my_song')
  })

  it('removes parenthetical qualifiers and key', () => {
    expect(slugifyTitle('Above All (Key of A)')).toBe('above_all')
    expect(slugifyTitle('Abba (Israeli) Key of Am')).toBe('abba')
  })

  it('removes hymn and hebrew qualifiers', () => {
    expect(slugifyTitle('Hymn Amazing Grace (Key of D)')).toBe('amazing_grace')
    expect(slugifyTitle('Let Us Sing to the Lord Hebrew')).toBe('let_us_sing_to_the_lord')
  })

  it('transliterates Turkish characters cleanly', () => {
    expect(slugifyTitle('İsa Beni Kurtardı')).toBe('isa_beni_kurtardi')
    expect(slugifyTitle('Köprü Çağrı Özgürlük')).toBe('kopru_cagri_ozgurluk')
    expect(slugifyTitle('İsa İsa Dirilmiş Yüce Mesihsin')).toBe('isa_isa_dirilmis_yuce_mesihsin')
  })
})
