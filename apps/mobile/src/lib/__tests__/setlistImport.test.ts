import { describe, expect, it } from 'vitest'
import { encodeSet } from '@gracechords/core'
import {
  buildMissingWarning,
  buildSavePayload,
  deslugify,
  parseCodeForm,
  parseSlugForm,
  resolveEntries,
  resolveImport,
  type ImportedEntry,
} from '../setlistImport'
import type { Song } from '../useSongList'

function song(slug: string, over: Partial<Song> = {}): Song {
  return {
    id: `uuid-${slug}`,
    slug,
    title: over.title ?? slug,
    artist: over.artist ?? null,
    default_key: over.default_key ?? 'C',
    time_signature: over.time_signature ?? null,
    tags: over.tags ?? null,
    tempo: over.tempo ?? null,
    created_at: over.created_at ?? null,
  }
}

const CATALOG: Song[] = [
  song('amazing-grace', { title: 'Amazing Grace', default_key: 'G' }),
  song('how-great-thou-art', { title: 'How Great Thou Art', default_key: 'Bb' }),
  song('cornerstone', { title: 'Cornerstone', default_key: 'C' }),
]

describe('parseSlugForm', () => {
  it('zips ids and toKeys by index; empty key means native (null)', () => {
    const out = parseSlugForm('amazing-grace,how-great-thou-art', 'G,')
    expect(out).toEqual<ImportedEntry[]>([
      { slug: 'amazing-grace', toKey: 'G' },
      { slug: 'how-great-thou-art', toKey: null },
    ])
  })

  it('URI-decodes per item (keys like C#) and drops empty ids', () => {
    const out = parseSlugForm('amazing-grace,,cornerstone', 'C%23,,')
    expect(out).toEqual<ImportedEntry[]>([
      { slug: 'amazing-grace', toKey: 'C#' },
      // second id is empty -> dropped, so keys realign by the filtered index
      { slug: 'cornerstone', toKey: null },
    ])
  })

  it('handles garbage input without throwing', () => {
    expect(parseSlugForm('', '')).toEqual([])
    expect(() => parseSlugForm('%%%bad', '%')).not.toThrow()
  })
})

describe('parseCodeForm (round-trip via core encodeSet)', () => {
  it('decodes a compact code back to slugs + key names', () => {
    // The web hashes the catalog id, which is the slug — mirror that here.
    const bySlug = CATALOG.map((s) => ({ id: s.slug }))
    const code = encodeSet(bySlug, [
      { id: 'amazing-grace', toKey: 'G' },
      { id: 'cornerstone', toKey: 'D' },
    ])
    expect(parseCodeForm(code, CATALOG)).toEqual<ImportedEntry[]>([
      { slug: 'amazing-grace', toKey: 'G' },
      { slug: 'cornerstone', toKey: 'D' },
    ])
  })

  it('returns [] for a malformed code (never throws)', () => {
    expect(parseCodeForm('!!!', CATALOG)).toEqual([])
    expect(parseCodeForm('', CATALOG)).toEqual([])
  })
})

describe('resolveEntries', () => {
  it('splits hits from misses and preserves per-song keys', () => {
    const { resolved, unresolved } = resolveEntries(
      [
        { slug: 'amazing-grace', toKey: 'G' },
        { slug: 'ghost-song', toKey: 'A' },
        { slug: 'cornerstone', toKey: null },
      ],
      CATALOG,
    )
    expect(resolved.map((r) => [r.song.slug, r.toKey])).toEqual([
      ['amazing-grace', 'G'],
      ['cornerstone', null],
    ])
    expect(unresolved).toEqual(['Ghost Song'])
  })
})

describe('deslugify', () => {
  it('title-cases a kebab slug', () => {
    expect(deslugify('amazing-grace')).toBe('Amazing Grace')
    expect(deslugify('how_great-thou-art')).toBe('How Great Thou Art')
  })

  it('returns "" for opaque ids with no derivable name', () => {
    expect(deslugify('verse:bsb:john-3-16')).toBe('')
    expect(deslugify('12345')).toBe('')
    expect(deslugify('')).toBe('')
  })
})

describe('buildMissingWarning (grammar for 1 / 2 / 3+)', () => {
  it('returns null when nothing is missing', () => {
    expect(buildMissingWarning([])).toBeNull()
  })

  it('names a single dropped song', () => {
    expect(buildMissingWarning(['Amazing Grace'])).toBe('Amazing Grace could not be found.')
  })

  it('joins two named songs with "and"', () => {
    expect(buildMissingWarning(['Amazing Grace', 'Cornerstone'])).toBe(
      'Amazing Grace and Cornerstone could not be found.',
    )
  })

  it('names up to two then counts the rest as "others"', () => {
    expect(buildMissingWarning(['Amazing Grace', 'Cornerstone', 'Doxology'])).toBe(
      'Amazing Grace, Cornerstone and 1 other could not be found.',
    )
    expect(
      buildMissingWarning(['Amazing Grace', 'Cornerstone', 'Doxology', 'Sanctus']),
    ).toBe('Amazing Grace, Cornerstone and 2 others could not be found.')
  })

  it('mixes a named song with unnamed misses', () => {
    expect(buildMissingWarning(['Amazing Grace', ''])).toBe(
      'Amazing Grace and 1 other could not be found.',
    )
  })

  it('falls back to a count when no name is derivable (never "1 songs")', () => {
    expect(buildMissingWarning([''])).toBe('1 song could not be found.')
    expect(buildMissingWarning(['', '', ''])).toBe('3 songs could not be found.')
  })
})

describe('buildSavePayload', () => {
  it('uses the song uuid and normalizes empty key to null', () => {
    const { resolved } = resolveEntries(
      [
        { slug: 'amazing-grace', toKey: 'G' },
        { slug: 'cornerstone', toKey: null },
      ],
      CATALOG,
    )
    expect(buildSavePayload(resolved)).toEqual([
      { id: 'uuid-amazing-grace', toKey: 'G' },
      { id: 'uuid-cornerstone', toKey: null },
    ])
  })
})

describe('resolveImport (screen entrypoint)', () => {
  it('parses the slug-list form when no code is given', () => {
    const res = resolveImport(
      { ids: 'amazing-grace,ghost-song', toKeys: 'G,A' },
      CATALOG,
    )
    expect(res.resolved.map((r) => r.song.slug)).toEqual(['amazing-grace'])
    expect(res.unresolved).toEqual(['Ghost Song'])
  })

  it('prefers the code form when present', () => {
    const bySlug = CATALOG.map((s) => ({ id: s.slug }))
    const code = encodeSet(bySlug, [{ id: 'cornerstone', toKey: 'C' }])
    const res = resolveImport({ code }, CATALOG)
    expect(res.resolved.map((r) => [r.song.slug, r.toKey])).toEqual([['cornerstone', 'C']])
  })
})
