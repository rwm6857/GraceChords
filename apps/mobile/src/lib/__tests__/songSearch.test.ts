import { describe, expect, it } from 'vitest'
import { TAG_MATCH, TITLE_MATCH, songMatchRank, songMatchesQuery } from '../songSearch'
import type { Song } from '../useSongList'

function song(partial: Partial<Song>): Song {
  return {
    id: '1',
    slug: 'song',
    title: 'Untitled',
    artist: null,
    default_key: null,
    time_signature: null,
    tags: null,
    tempo: null,
    created_at: null,
    source: 'published',
    ...partial,
  } as Song
}

describe('songMatchRank', () => {
  it('ranks a title match highest (0)', () => {
    expect(songMatchRank(song({ title: 'Amazing Grace' }), 'grace')).toBe(TITLE_MATCH)
  })

  it('ranks a tag-only match below a title match (1)', () => {
    expect(songMatchRank(song({ title: 'Silent Night', tags: ['Christmas', 'Advent'] }), 'advent')).toBe(TAG_MATCH)
  })

  it('prefers the title when the query hits both title and a tag', () => {
    expect(songMatchRank(song({ title: 'Christmas Morning', tags: ['Christmas'] }), 'christmas')).toBe(TITLE_MATCH)
  })

  it('does NOT match on artist', () => {
    expect(songMatchRank(song({ title: 'Doxology', artist: 'Chris Tomlin' }), 'tomlin')).toBeNull()
  })

  it('returns null when the query is absent from title and tags', () => {
    expect(songMatchRank(song({ title: 'Silent Night', tags: ['Christmas'] }), 'easter')).toBeNull()
  })

  it('tolerates null tags', () => {
    expect(songMatchRank(song({ title: 'Solo', tags: null }), 'solo')).toBe(TITLE_MATCH)
    expect(songMatchRank(song({ title: 'Solo', tags: null }), 'zzz')).toBeNull()
  })
})

describe('songMatchesQuery', () => {
  it('is true for a title or tag match, false otherwise', () => {
    expect(songMatchesQuery(song({ title: 'Grace' }), 'grace')).toBe(true)
    expect(songMatchesQuery(song({ title: 'Grace', tags: ['Hymn'] }), 'hymn')).toBe(true)
    expect(songMatchesQuery(song({ title: 'Grace', artist: 'Tomlin' }), 'tomlin')).toBe(false)
  })
})
