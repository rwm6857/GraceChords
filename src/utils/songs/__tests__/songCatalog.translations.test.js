import { describe, it, expect } from 'vitest'
import {
  buildSongCatalog,
  hasGroupLanguage,
  normalizeSongEntry,
  resolveGroupEntry,
} from '../songCatalog'

describe('songCatalog translation linking', () => {
  it('groups songs by songId and resolves variants by selected language', () => {
    const catalog = buildSongCatalog([
      {
        id: 'grace-en',
        songId: 'grace-on-grace',
        language: 'en',
        title: 'Grace on Grace',
        filename: 'translation_demo_grace_on_grace_en.chordpro',
      },
      {
        id: 'grace-tr',
        songId: 'grace-on-grace',
        language: 'tr',
        title: 'Lutuf Ustune Lutuf',
        filename: 'translation_demo_grace_on_grace_tr.chordpro',
      },
      {
        id: 'only-en',
        title: 'Only English',
        filename: 'only_english.chordpro',
      },
    ])

    expect(catalog.groups).toHaveLength(2)
    expect(catalog.translationLanguages).toEqual(['en', 'tr'])

    const graceGroup = catalog.groupBySongId.get('grace-on-grace')
    expect(graceGroup).toBeTruthy()
    expect(graceGroup.languages).toEqual(['en', 'tr'])

    expect(resolveGroupEntry(graceGroup, 'tr')?.id).toBe('grace-tr')
    expect(resolveGroupEntry(graceGroup, 'es')?.id).toBe('grace-en')
    expect(hasGroupLanguage(graceGroup, 'tr')).toBe(true)
    expect(hasGroupLanguage(graceGroup, 'es')).toBe(false)
  })

  it('defaults language to english when untagged', () => {
    const normalized = normalizeSongEntry({
      id: 'untagged-song',
      title: 'Untagged Song',
      filename: 'untagged_song.chordpro',
    })
    expect(normalized?.language).toBe('en')
  })
})
