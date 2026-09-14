import { describe, expect, test } from 'vitest'
import { buildChordProArchiveFiles, chordProArchiveName, withTitleDirective } from '../chordproArchive'
import { hasDisclaimerCommentBlock } from '../../chordpro/disclaimer'

describe('withTitleDirective', () => {
  test('prepends the directive as the first line', () => {
    expect(withTitleDirective('[C]body\n', 'Song One')).toBe('{title: Song One}\n[C]body\n')
  })

  test('leaves a body that already declares a title alone', () => {
    const body = '{title: Already Here}\n[C]body\n'
    expect(withTitleDirective(body, 'Different')).toBe(body)
    expect(withTitleDirective('[C]body\n{TITLE : Late}\n', 'Different')).toContain('{TITLE : Late}')
  })

  test('strips braces and collapses whitespace so the directive stays valid', () => {
    expect(withTitleDirective('body', ' A  {weird}\nname ')).toBe('{title: A weird name}\nbody')
  })

  test('returns the body untouched when there is no title', () => {
    expect(withTitleDirective('[C]body', '')).toBe('[C]body')
    expect(withTitleDirective('[C]body', null)).toBe('[C]body')
  })

  test('does not leave a blank line between the title and the body', () => {
    expect(withTitleDirective('\n\n[C]body', 'T')).toBe('{title: T}\n[C]body')
  })
})

describe('buildChordProArchiveFiles', () => {
  test('names each file <slug>.pro, titled, with the ChordPro body intact', () => {
    const files = buildChordProArchiveFiles([
      { slug: 'first-song', title: 'First Song', chordpro_content: '[C]body\n' },
      { slug: 'second-song', title: 'Second Song', chordpro_content: '[G]body\n' },
    ])
    expect(files.map(f => f.path)).toEqual(['first-song.pro', 'second-song.pro'])
    expect(files[0].content.split('\n')[0]).toBe('{title: First Song}')
    expect(files[0].content).toContain('[C]body')
    expect(files[1].content.split('\n')[0]).toBe('{title: Second Song}')
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
