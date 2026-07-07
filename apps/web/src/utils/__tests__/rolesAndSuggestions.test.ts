import { describe, it, expect } from 'vitest'
import {
  ROLE_ORDER,
  hasMinRole,
  canDirectWrite,
  submitSongSuggestion,
} from '@gracechords/core'

describe('role hierarchy (collaborator removed)', () => {
  it('no longer includes collaborator', () => {
    expect(ROLE_ORDER).toEqual(['user', 'editor', 'admin', 'owner'])
  })
  it('canDirectWrite is editor+', () => {
    expect(canDirectWrite('user')).toBe(false)
    expect(canDirectWrite('editor')).toBe(true)
    expect(canDirectWrite('owner')).toBe(true)
  })
  it('hasMinRole still ranks correctly', () => {
    expect(hasMinRole('admin', 'editor')).toBe(true)
    expect(hasMinRole('user', 'editor')).toBe(false)
  })
})

describe('submitSongSuggestion', () => {
  it('inserts a pending row with type and suggested_by', async () => {
    let inserted: any = null
    const client = {
      auth: { async getUser() { return { data: { user: { id: 'u1' } }, error: null } } },
      from() {
        return {
          insert(row: any) { inserted = row; return this },
          select() { return this },
          async single() { return { data: { id: 's1' }, error: null } },
        }
      },
    }
    const res = await submitSongSuggestion(client as any, {
      type: 'addition',
      payload: { title: 'X' },
      personalSongId: 'p1',
    })
    expect(res).toEqual({ id: 's1' })
    expect(inserted.type).toBe('addition')
    expect(inserted.status).toBe('pending')
    expect(inserted.suggested_by).toBe('u1')
    expect(inserted.song_id).toBeNull()
    expect(inserted.personal_song_id).toBe('p1')
  })
})
