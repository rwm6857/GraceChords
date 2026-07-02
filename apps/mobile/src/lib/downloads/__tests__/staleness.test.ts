import { describe, expect, it } from 'vitest'
import { isTranslationStale } from '../staleness'

describe('isTranslationStale', () => {
  it('is stale when both versions are known and differ', () => {
    expect(isTranslationStale('v1', 'v2')).toBe(true)
  })

  it('is fresh when versions match', () => {
    expect(isTranslationStale('v2', 'v2')).toBe(false)
  })

  it('is fresh (no churn) when the remote version is unknown', () => {
    expect(isTranslationStale('v1', '')).toBe(false)
  })

  it('is fresh when there is no local baseline', () => {
    expect(isTranslationStale('', 'v2')).toBe(false)
  })
})
