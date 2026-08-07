import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PENDING_SPRITE_KEY,
  flushPendingSprite,
  resolveDisplayName,
  saveDisplayName,
  saveSpritePreference,
  stashPendingSprite,
  type KVStorage,
} from '../profile'

// Chainable stub for the two query shapes profile.ts uses:
//   from('users').select('preferences').eq('id', ...).maybeSingle()
//   from('users').update({...}).eq('id', ...).select('id')
function fakeDb(options: {
  preferences?: Record<string, unknown> | null
  readError?: { message: string }
  writeError?: { message: string }
  updatedRows?: Array<{ id: string }>
}) {
  const update = vi.fn()
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: options.readError ? null : { preferences: options.preferences ?? null },
          error: options.readError ?? null,
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      update(payload)
      return {
        eq: () => ({
          select: async () => ({
            data: options.writeError ? null : (options.updatedRows ?? [{ id: 'user-1' }]),
            error: options.writeError ?? null,
          }),
        }),
      }
    },
  }))
  return { client: { from } as unknown as SupabaseClient, from, update }
}

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

describe('saveSpritePreference', () => {
  it('merges the sprite into existing preferences without clobbering other keys', async () => {
    const db = fakeDb({ preferences: { fontSize: 18, theme: 'dark' } })
    const result = await saveSpritePreference(db.client, 'user-1', 'lamb')

    expect(result.error).toBeNull()
    expect(db.from).toHaveBeenCalledWith('users')
    expect(db.update).toHaveBeenCalledWith({
      preferences: { fontSize: 18, theme: 'dark', sprite: 'lamb' },
    })
  })

  it('handles a null preferences column', async () => {
    const db = fakeDb({ preferences: null })
    const result = await saveSpritePreference(db.client, 'user-1', 'star')
    expect(result.error).toBeNull()
    expect(db.update).toHaveBeenCalledWith({ preferences: { sprite: 'star' } })
  })

  it('overwrites a previous sprite pick', async () => {
    const db = fakeDb({ preferences: { sprite: 'boba' } })
    await saveSpritePreference(db.client, 'user-1', 'lion')
    expect(db.update).toHaveBeenCalledWith({ preferences: { sprite: 'lion' } })
  })

  it('returns an error when zero rows were updated (RLS / missing row)', async () => {
    const db = fakeDb({ preferences: {}, updatedRows: [] })
    const result = await saveSpritePreference(db.client, 'user-1', 'lamb')
    expect(result.error).toMatch(/not found|not writable/i)
  })

  it('propagates read and write errors', async () => {
    const readFail = fakeDb({ readError: { message: 'read boom' } })
    expect((await saveSpritePreference(readFail.client, 'u', 's')).error).toBe('read boom')

    const writeFail = fakeDb({ preferences: {}, writeError: { message: 'write boom' } })
    expect((await saveSpritePreference(writeFail.client, 'u', 's')).error).toBe('write boom')
  })
})

describe('stash / flush pending sprite', () => {
  it('stashes under the pending key', async () => {
    const storage = memoryStorage()
    await stashPendingSprite(storage, 'charlie')
    expect(storage.store.get(PENDING_SPRITE_KEY)).toBe('charlie')
  })

  it('flush writes the stashed sprite and removes the key on success', async () => {
    const db = fakeDb({ preferences: {} })
    const storage = memoryStorage({ [PENDING_SPRITE_KEY]: 'charlie' })

    await flushPendingSprite(db.client, storage, 'user-1')
    expect(db.update).toHaveBeenCalledWith({ preferences: { sprite: 'charlie' } })
    expect(storage.store.has(PENDING_SPRITE_KEY)).toBe(false)
  })

  it('flush keeps the key when the write fails, so it retries next sign-in', async () => {
    const db = fakeDb({ preferences: {}, updatedRows: [] })
    const storage = memoryStorage({ [PENDING_SPRITE_KEY]: 'charlie' })

    await flushPendingSprite(db.client, storage, 'user-1')
    expect(storage.store.get(PENDING_SPRITE_KEY)).toBe('charlie')
  })

  it('flush is a no-op when nothing is stashed', async () => {
    const db = fakeDb({ preferences: {} })
    const storage = memoryStorage()

    await flushPendingSprite(db.client, storage, 'user-1')
    expect(db.from).not.toHaveBeenCalled()
  })

  it('flush swallows thrown storage errors', async () => {
    const db = fakeDb({ preferences: {} })
    const storage: KVStorage = {
      getItem: async () => {
        throw new Error('storage boom')
      },
      setItem: async () => {},
      removeItem: async () => {},
    }
    await expect(flushPendingSprite(db.client, storage, 'user-1')).resolves.toBeUndefined()
  })
})

describe('resolveDisplayName', () => {
  const user = {
    email: 'ryan@example.com',
    user_metadata: { full_name: 'Ryan Moore (mooer112233)', name: 'Ryan M' },
  }

  it('prefers the edited column over the provider profile', () => {
    // The whole point of storing the name in public.users: an OAuth sign-in
    // repopulates user_metadata, so the column has to win.
    expect(resolveDisplayName('Ryan Moore', user)).toBe('Ryan Moore')
  })

  it('falls back to full_name when nothing has been edited', () => {
    expect(resolveDisplayName(null, user)).toBe('Ryan Moore (mooer112233)')
  })

  it('falls back to name when full_name is absent', () => {
    expect(resolveDisplayName(null, { email: 'a@b.co', user_metadata: { name: 'Just Name' } })).toBe(
      'Just Name',
    )
  })

  it('falls back to the email local part when no metadata name exists', () => {
    expect(resolveDisplayName(null, { email: 'ryan@example.com', user_metadata: {} })).toBe('ryan')
  })

  it('returns null when nothing is usable, so callers localize the fallback', () => {
    expect(resolveDisplayName(null, null)).toBeNull()
    expect(resolveDisplayName('   ', { email: null, user_metadata: {} })).toBeNull()
  })
})

describe('saveDisplayName', () => {
  it('writes the trimmed name to display_name', async () => {
    const db = fakeDb({ updatedRows: [{ id: 'user-1' }] })
    const result = await saveDisplayName(db.client, 'user-1', '  Ryan Moore  ')

    expect(result).toEqual({ error: null })
    expect(db.update).toHaveBeenCalledWith({ display_name: 'Ryan Moore' })
  })

  it('reports an RLS-denied write rather than reporting success', async () => {
    const db = fakeDb({ updatedRows: [] })
    const result = await saveDisplayName(db.client, 'user-1', 'Ryan')

    expect(result.error).toBeTruthy()
  })
})
