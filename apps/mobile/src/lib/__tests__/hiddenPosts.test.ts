import { describe, it, expect, beforeEach } from 'vitest'
import {
  hydrateHiddenPosts,
  getHiddenPosts,
  isHidden,
  hideReflection,
  __resetHiddenPostsForTest,
} from '../hiddenPosts'
import type { KVStorage } from '../defaults'

function memoryStorage(initial: Record<string, string> = {}): KVStorage & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  return {
    store,
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
  }
}

const KEY = 'gc.hiddenReflections.v1'

describe('hiddenPosts store', () => {
  beforeEach(() => __resetHiddenPostsForTest())

  it('starts empty and hydrates from storage', async () => {
    await hydrateHiddenPosts(memoryStorage())
    expect([...getHiddenPosts()]).toEqual([])

    await hydrateHiddenPosts(memoryStorage({ [KEY]: JSON.stringify(['a', 'b']) }))
    expect(isHidden('a')).toBe(true)
    expect(isHidden('b')).toBe(true)
    expect(isHidden('c')).toBe(false)
  })

  it('ignores a corrupt blob and falls back to empty', async () => {
    await hydrateHiddenPosts(memoryStorage({ [KEY]: '{not json' }))
    expect([...getHiddenPosts()]).toEqual([])
  })

  it('hides ids, persists, and is idempotent', async () => {
    const s = memoryStorage()
    await hydrateHiddenPosts(s)
    hideReflection('x')
    hideReflection('x') // idempotent
    hideReflection('y')
    expect(isHidden('x')).toBe(true)
    expect(JSON.parse(s.store.get(KEY) as string).sort()).toEqual(['x', 'y'])
  })

  it('replaces the Set reference on change (stable snapshot between changes)', async () => {
    await hydrateHiddenPosts(memoryStorage())
    const before = getHiddenPosts()
    hideReflection('z')
    expect(getHiddenPosts()).not.toBe(before) // new reference → useSyncExternalStore re-renders
    const after = getHiddenPosts()
    hideReflection('z') // no-op
    expect(getHiddenPosts()).toBe(after) // unchanged reference when nothing changed
  })
})
