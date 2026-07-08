import { afterEach, describe, expect, it } from 'vitest'
import type { SongForm } from '@gracechords/core'
import {
  __resetDraftsForTest,
  flushDrafts,
  getDraft,
  hydrateDrafts,
  removeDraft,
  upsertDraft,
} from '../drafts/draftsStore'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    store: map,
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: async (k: string) => {
      map.delete(k)
    },
  }
}

const form: SongForm = {
  title: 'Test',
  artist: '',
  default_key: 'G',
  tempo: '',
  time_signature: '',
  country: '',
  youtube_id: '',
  language: '',
  pptx_url: '',
  tags: ['hymn'],
  chordpro_content: '[G]hi',
}

afterEach(() => __resetDraftsForTest())

describe('draftsStore', () => {
  it('upserts and reads a draft synchronously', async () => {
    const storage = fakeStorage()
    await hydrateDrafts(storage)
    upsertDraft({ id: 'd1', form, status: 'draft', updatedAt: '' })
    const d = getDraft('d1')
    expect(d?.form.title).toBe('Test')
    expect(d?.updatedAt).not.toBe('') // stamped on write
  })

  it('persists to storage on flush and survives a reload', async () => {
    const storage = fakeStorage()
    await hydrateDrafts(storage)
    upsertDraft({ id: 'd1', form, status: 'draft', updatedAt: '' })
    flushDrafts()
    expect(storage.store.has('gc.songdrafts.v1')).toBe(true)

    // Simulate a relaunch: reset module state, re-hydrate from the same storage.
    __resetDraftsForTest()
    await hydrateDrafts(storage)
    expect(getDraft('d1')?.form.chordpro_content).toBe('[G]hi')
  })

  it('removes a draft', async () => {
    const storage = fakeStorage()
    await hydrateDrafts(storage)
    upsertDraft({ id: 'd1', form, status: 'draft', updatedAt: '' })
    removeDraft('d1')
    expect(getDraft('d1')).toBeUndefined()
  })
})
