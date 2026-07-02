import { describe, expect, it } from 'vitest'
import { readLocalChapter, type ResolverDeps } from '../resolver'
import { createMemoryBlobStore } from '../memoryBlobStore'
import { chapterRelPath } from '../paths'
import { chapterJson, TEST_TRANSLATION } from './helpers'

const dataRoot = TEST_TRANSLATION.dataRoot

async function seededDeps(): Promise<ResolverDeps> {
  const blobStore = createMemoryBlobStore()
  await blobStore.writeText(chapterRelPath(dataRoot, 1, 1), chapterJson(1, 1))
  return { isDownloaded: () => true, blobStore }
}

describe('readLocalChapter (read-path resolver)', () => {
  it('returns the local chapter when downloaded and present', async () => {
    const deps = await seededDeps()
    const res = await readLocalChapter('esv', dataRoot, 1, 1, deps)
    expect(res?.verses['1']).toBe('book 1 chapter 1 verse 1')
    expect(res?.chapter).toBe(1)
  })

  it('returns null when the translation is not downloaded (network fallback)', async () => {
    const deps = await seededDeps()
    const res = await readLocalChapter('esv', dataRoot, 1, 1, { ...deps, isDownloaded: () => false })
    expect(res).toBeNull()
  })

  it('returns null when the file is missing', async () => {
    const deps = await seededDeps()
    expect(await readLocalChapter('esv', dataRoot, 9, 9, deps)).toBeNull()
  })

  it('returns null (never throws) on a corrupt file', async () => {
    const deps = await seededDeps()
    await deps.blobStore.writeText(chapterRelPath(dataRoot, 2, 1), '{ not json')
    expect(await readLocalChapter('esv', dataRoot, 2, 1, deps)).toBeNull()
  })
})
