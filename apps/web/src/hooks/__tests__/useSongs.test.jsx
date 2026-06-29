import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// useSongs holds a module-level cache (_cache/_promise/_listeners). Reset the
// module registry before each test so one test's cache can't leak into the next.
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

/**
 * Build a supabase stub matching the query chain useSongs issues:
 *   supabase.from('songs').select(...).eq('is_deleted', false).order('title')
 * .order() resolves to { data, error }.
 */
function mockSupabase(result) {
  const order = vi.fn().mockReturnValue(Promise.resolve(result))
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { from }, spies: { from, select, eq, order } }
}

const fullRow = {
  id: 'uuid-1',
  slug: 'abba',
  title: 'Abba',
  artist: 'Alice, Bob',
  default_key: 'Am',
  tags: ['worship'],
  country: 'US',
  youtube_id: 'abc123',
  source_filename: 'abba_song',
  chordpro_content: 'title: Abba\n[Am]Father',
  star_count: 3,
  song_group_id: 'group-1',
  is_deleted: false,
  has_stems: true,
  stem_slug: 'abba-stems',
  gracetracks_url: 'https://tracks.example/abba',
}

describe('useSongs', () => {
  it('normalises supabase rows into the catalog shape', async () => {
    const { client } = mockSupabase({ data: [fullRow], error: null })
    vi.doMock('../../lib/supabase', () => ({ supabase: client }))
    const { useSongs } = await import('../useSongs')

    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.songs).toHaveLength(1)
    expect(result.current.songs[0]).toMatchObject({
      dbId: 'uuid-1',          // UUID kept for FK relationships (starring)
      id: 'abba',              // slug becomes the routing id
      songId: 'abba',
      title: 'Abba',
      originalKey: 'Am',       // default_key → originalKey
      authors: ['Alice', 'Bob'], // artist string split into an array
      country: 'US',
      tags: ['worship'],
      youtube: 'https://www.youtube.com/watch?v=abc123', // youtube_id → full URL
      chordpro_content: 'title: Abba\n[Am]Father',
      filename: 'abba_song.chordpro', // source_filename + .chordpro
      star_count: 3,
      song_group_id: 'group-1',
      has_stems: true,
      stem_slug: 'abba-stems',
      gracetracks_url: 'https://tracks.example/abba',
    })
  })

  it('derives filename from the slug when source_filename is absent', async () => {
    const row = { ...fullRow, source_filename: null, slug: 'how-great' }
    const { client } = mockSupabase({ data: [row], error: null })
    vi.doMock('../../lib/supabase', () => ({ supabase: client }))
    const { useSongs } = await import('../useSongs')

    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.songs[0].filename).toBe('how_great.chordpro')
  })

  it('handles empty/missing metadata without throwing', async () => {
    const row = { id: 'u2', slug: 'plain', title: 'Plain', is_deleted: false }
    const { client } = mockSupabase({ data: [row], error: null })
    vi.doMock('../../lib/supabase', () => ({ supabase: client }))
    const { useSongs } = await import('../useSongs')

    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.songs[0]).toMatchObject({
      authors: [],
      tags: [],
      youtube: null,
      originalKey: '',
      has_stems: false,
      stem_slug: null,
      gracetracks_url: null,
    })
  })

  it('falls back to an empty list and logs when supabase returns an error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = mockSupabase({ data: null, error: { message: 'boom' } })
    vi.doMock('../../lib/supabase', () => ({ supabase: client }))
    const { useSongs } = await import('../useSongs')

    const { result } = renderHook(() => useSongs())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.songs).toEqual([])
    expect(errSpy).toHaveBeenCalled()
  })

  it('serves cached data to later instances without refetching (dedupe)', async () => {
    const { client, spies } = mockSupabase({ data: [fullRow], error: null })
    vi.doMock('../../lib/supabase', () => ({ supabase: client }))
    const { useSongs } = await import('../useSongs')

    const first = renderHook(() => useSongs())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(spies.from).toHaveBeenCalledTimes(1)

    // A second mount within the cache window must not trigger another fetch and
    // must not flash a loading state.
    const second = renderHook(() => useSongs())
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.songs).toHaveLength(1)
    expect(spies.from).toHaveBeenCalledTimes(1)
  })
})
