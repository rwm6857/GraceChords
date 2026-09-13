import { describe, expect, it } from 'vitest'
import { planEviction, type CacheEntry } from '../cacheBudget'

const e = (path: string, bytes: number, lastUsedMs: number): CacheEntry => ({
  path,
  bytes,
  lastUsedMs,
})

describe('planEviction', () => {
  it('plans nothing when the cache is under budget', () => {
    expect(planEviction([e('a', 10, 1), e('b', 10, 2)], 100)).toEqual([])
  })

  it('plans nothing when the cache exactly meets the budget', () => {
    expect(planEviction([e('a', 50, 1), e('b', 50, 2)], 100)).toEqual([])
  })

  it('evicts oldest-first and stops as soon as it fits', () => {
    const entries = [e('new', 40, 300), e('old', 40, 100), e('mid', 40, 200)]
    // 120 total, budget 100 — dropping the single oldest is enough.
    expect(planEviction(entries, 100)).toEqual(['old'])
  })

  it('keeps evicting until it fits', () => {
    const entries = [e('a', 40, 100), e('b', 40, 200), e('c', 40, 300)]
    expect(planEviction(entries, 45)).toEqual(['a', 'b'])
  })

  it('never evicts a protected path, even when it is the oldest', () => {
    const entries = [e('manifest.json', 40, 1), e('x', 40, 200), e('y', 40, 300)]
    expect(planEviction(entries, 50, ['manifest.json'])).toEqual(['x', 'y'])
  })

  it('treats a negative or missing size as zero rather than crediting space', () => {
    const entries = [e('a', -5, 100), e('b', 200, 200)]
    expect(planEviction(entries, 100)).toEqual(['a', 'b'])
  })

  it('returns every evictable path when the budget cannot be met', () => {
    const entries = [e('keep', 100, 1), e('a', 100, 2)]
    expect(planEviction(entries, 0, ['keep'])).toEqual(['a'])
  })
})
