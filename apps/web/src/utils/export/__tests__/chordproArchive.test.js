import { describe, expect, test } from 'vitest'
import { buildChordProArchiveFiles, chordProArchiveName } from '../chordproArchive'
import { hasDisclaimerCommentBlock } from '../../chordpro/disclaimer'

describe('buildChordProArchiveFiles', () => {
  test('names each file <slug>.pro and keeps the ChordPro body', () => {
    const files = buildChordProArchiveFiles([
      { slug: 'first-song', chordpro_content: '{title: First}\n[C]body\n' },
      { slug: 'second-song', chordpro_content: '{title: Second}\n[G]body\n' },
    ])
    expect(files.map(f => f.path)).toEqual(['first-song.pro', 'second-song.pro'])
    expect(files[0].content).toContain('{title: First}')
    expect(files[0].content).toContain('[C]body')
  })

  test('appends the disclaimer like the single-song download', () => {
    const [file] = buildChordProArchiveFiles([{ slug: 's', chordpro_content: '[C]body' }])
    expect(hasDisclaimerCommentBlock(file.content)).toBe(true)
  })

  test('skips rows without a slug and tolerates missing content', () => {
    const files = buildChordProArchiveFiles([
      { slug: '', chordpro_content: 'x' },
      { chordpro_content: 'x' },
      { slug: 'kept' },
      null,
    ])
    expect(files.map(f => f.path)).toEqual(['kept.pro'])
  })

  test('sanitises slugs so no entry can escape the archive root', () => {
    const files = buildChordProArchiveFiles([{ slug: '../../etc/passwd', chordpro_content: '' }])
    expect(files[0].path).toBe('etc_passwd.pro')
  })

  test('suffixes duplicate names instead of overwriting', () => {
    const files = buildChordProArchiveFiles([
      { slug: 'dup', chordpro_content: 'a' },
      { slug: 'dup', chordpro_content: 'b' },
      { slug: 'dup', chordpro_content: 'c' },
    ])
    expect(files.map(f => f.path)).toEqual(['dup.pro', 'dup-2.pro', 'dup-3.pro'])
  })

  test('handles a null list', () => {
    expect(buildChordProArchiveFiles(null)).toEqual([])
  })
})

describe('chordProArchiveName', () => {
  test('is date-stamped', () => {
    expect(chordProArchiveName(new Date('2026-09-14T12:00:00Z'))).toBe(
      'gracechords-chordpro-2026-09-14.zip'
    )
  })
})
