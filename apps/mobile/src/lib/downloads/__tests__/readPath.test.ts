import { describe, expect, it } from 'vitest'
import type { ChapterData, Passage } from '@gracechords/core'
import { resolvePassageChapter, type PassageQuery } from '../../bibleSource'
import { TEST_TRANSLATION } from './helpers'

const passage: Passage = { bookNumber: 1, book: 'Genesis', chapter: 1, range: null }
const query: PassageQuery = { passage, translation: TEST_TRANSLATION }

const local: ChapterData = { book: 'Genesis', chapter: 1, verses: { '1': 'from local' } }
const remote: ChapterData = { book: 'Genesis', chapter: 1, verses: { '1': 'from network' } }

describe('resolvePassageChapter (offline-first seam)', () => {
  it('returns the local copy and does NOT hit the network when downloaded', async () => {
    let fetchCalls = 0
    const res = await resolvePassageChapter(query, {
      readLocal: async () => local,
      fetchRemote: async () => {
        fetchCalls++
        return remote
      },
    })
    expect(res).toBe(local)
    expect(fetchCalls).toBe(0)
  })

  it('falls back to the network when there is no local copy', async () => {
    let fetchCalls = 0
    const res = await resolvePassageChapter(query, {
      readLocal: async () => null,
      fetchRemote: async () => {
        fetchCalls++
        return remote
      },
    })
    expect(res).toBe(remote)
    expect(fetchCalls).toBe(1)
  })
})
