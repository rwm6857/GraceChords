import { describe, expect, it } from 'vitest'
import { buildTagMap, canonicalizeTags, normalizeTagKey, tagLabelFromKey } from '../tags'

describe('tag normalization', () => {
  it('normalizes keys case-insensitively', () => {
    expect(normalizeTagKey('  HYmN  ')).toBe('hymn')
  })

  it('uses sentence case by default but preserves known acronyms', () => {
    expect(tagLabelFromKey('hymn')).toBe('Hymn')
    expect(tagLabelFromKey('icp')).toBe('ICP')
  })

  it('dedupes tags across casing and emits canonical labels', () => {
    const map = buildTagMap([{ tags: ['HYMN', 'hymn', 'ICP', 'icp'] }])
    const { keys, labels } = canonicalizeTags(['Hymn', 'HYMN', 'icp'], map)
    expect(keys).toEqual(['hymn', 'icp'])
    expect(labels).toEqual(['Hymn', 'ICP'])
  })
})

