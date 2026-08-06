import { describe, it, expect } from 'vitest'
import {
  ROLE_ORDER,
  hasMinRole,
  canDirectWrite,
  submitSongSuggestion,
} from '@gracechords/core'

describe('role hierarchy', () => {
  it('is exactly user → editor → admin → owner', () => {
    expect(ROLE_ORDER).toEqual(['user', 'editor', 'admin', 'owner'])
  })
  it('fails closed for a role outside the hierarchy', () => {
    // A retired or misspelled role must grant nothing at all — not even
    // user-level. indexOf returns -1, which ranks below every real role.
    // 'collaborator' was a real role until 20260708000000 and is the realistic
    // instance of this class; users_role_check now rejects the value outright.
    for (const stray of ['collaborator', 'nonsense']) {
      expect(hasMinRole(stray, 'user')).toBe(false)
      expect(hasMinRole(stray, 'editor')).toBe(false)
      expect(canDirectWrite(stray)).toBe(false)
    }
  })
  it('treats an empty role as user, unlike an unknown one', () => {
    expect(hasMinRole('', 'user')).toBe(true)
    expect(hasMinRole('', 'editor')).toBe(false)
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
