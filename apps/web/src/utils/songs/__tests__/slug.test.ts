import { describe, it, expect } from 'vitest'
import { slugify, deriveUniqueSlug } from '@gracechords/core'

describe('slugify', () => {
  it('lowercases and underscore-separates', () => {
    expect(slugify('Amazing Grace')).toBe('amazing_grace')
    expect(slugify("It Is Well (with my soul)")).toBe('it_is_well_with_my_soul')
    expect(slugify('  --Hi--  ')).toBe('hi')
    expect(slugify('')).toBe('')
  })
})

// Minimal fake Supabase query builder for collision probing.
function fakeClient(existingSlugs: Record<string, { id: string }>) {
  return {
    from() {
      const state: any = { slug: null }
      const builder: any = {
        select() { return builder },
        eq(col: string, val: string) {
          if (col === 'slug') state.slug = val
          return builder
        },
        async maybeSingle() {
          const hit = existingSlugs[state.slug]
          return { data: hit || null, error: null }
        },
      }
      return builder
    },
  }
}

describe('deriveUniqueSlug', () => {
  it('returns the base slug when free', async () => {
    const client = fakeClient({})
    expect(await deriveUniqueSlug(client, 'New Song')).toBe('new_song')
  })

  it('appends a numeric suffix on collision', async () => {
    const client = fakeClient({ new_song: { id: 'other' } })
    expect(await deriveUniqueSlug(client, 'New Song')).toBe('new_song_2')
  })

  it('does not count the current row as a collision', async () => {
    const client = fakeClient({ new_song: { id: 'me' } })
    expect(await deriveUniqueSlug(client, 'New Song', { currentId: 'me' })).toBe('new_song')
  })
})
