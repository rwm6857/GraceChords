import { describe, it, expect } from 'vitest'
import { buildSnapshot, generateSessionCode } from '@gracechords/core'

describe('generateSessionCode', () => {
  it('produces a code of the requested length from the unambiguous alphabet', () => {
    const code = generateSessionCode(6)
    expect(code).toHaveLength(6)
    // No ambiguous characters (0, O, 1, I, L).
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/)
  })

  it('is (practically) unique across calls', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateSessionCode(6)))
    expect(codes.size).toBeGreaterThan(190)
  })
})

describe('buildSnapshot', () => {
  it('maps public songs to renderable references with index-derived uids', () => {
    const snap = buildSnapshot([
      { songId: 'uuid-1', toKey: 'A', song: { slug: '10000-reasons', title: '10,000 Reasons', default_key: 'G' } },
      { songId: 'uuid-2', toKey: null, song: { slug: 'good-good-father', title: 'Good Good Father', default_key: 'A' } },
    ])
    expect(snap).toEqual([
      { uid: 'i0', kind: 'song', slug: '10000-reasons', title: '10,000 Reasons', defaultKey: 'G', toKey: 'A' },
      { uid: 'i1', kind: 'song', slug: 'good-good-father', title: 'Good Good Father', defaultKey: 'A', toKey: null },
    ])
  })

  it('records personal songs and verses as unavailable placeholders', () => {
    const snap = buildSnapshot([
      { songId: 'personal:abc', song: { title: 'My Draft' } },
      { songId: 'v:esv|John 3:16', song: { title: 'John 3:16' } },
    ])
    expect(snap[0]).toEqual({ uid: 'i0', kind: 'unavailable', title: 'My Draft', reason: 'personal' })
    expect(snap[1]).toEqual({ uid: 'i1', kind: 'unavailable', title: 'John 3:16', reason: 'verse' })
  })

  it('treats a public song with no slug as unavailable rather than shipping an unrenderable ref', () => {
    const snap = buildSnapshot([{ songId: 'uuid-x', song: { title: 'Orphaned' } }])
    expect(snap[0]).toEqual({ uid: 'i0', kind: 'unavailable', title: 'Orphaned', reason: 'personal' })
  })
})
