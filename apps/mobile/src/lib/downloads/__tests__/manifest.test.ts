import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetDownloadsForTest,
  getDownload,
  getDownloadsSnapshot,
  hydrateDownloads,
  isDownloaded,
  removeDownload,
  setWifiOnly,
  upsertDownload,
} from '../manifest'
import type { BibleDownload } from '../types'
import { memoryStorage } from './helpers'

const recA: BibleDownload = {
  id: 'esv',
  type: 'bible',
  dataRoot: 'bible/en/esv',
  label: 'ESV',
  name: 'English Standard Version',
  language: 'English',
  version: 'v1',
  sizeBytes: 1234,
  chapterCount: 1189,
  downloadedAt: '2026-07-02T00:00:00.000Z',
  status: 'complete',
}

describe('downloads manifest', () => {
  beforeEach(() => __resetDownloadsForTest())

  it('is empty before anything is recorded', async () => {
    await hydrateDownloads(memoryStorage())
    expect(getDownloadsSnapshot().records).toEqual({})
    expect(getDownloadsSnapshot().wifiOnly).toBe(false)
    expect(isDownloaded('esv')).toBe(false)
  })

  it('records, reads back, and removes a download', async () => {
    await hydrateDownloads(memoryStorage())
    upsertDownload(recA)
    expect(isDownloaded('esv')).toBe(true)
    expect(getDownload('esv')).toEqual(recA)

    // "mark stale" = a re-download overwrites with a new version.
    upsertDownload({ ...recA, version: 'v2' })
    expect(getDownload('esv')?.version).toBe('v2')

    const removed = removeDownload('esv')
    expect(removed?.id).toBe('esv')
    expect(isDownloaded('esv')).toBe(false)
    expect(getDownloadsSnapshot().records).toEqual({})
  })

  it('survives a simulated reload (re-hydrate from the same storage)', async () => {
    const s = memoryStorage()
    await hydrateDownloads(s)
    upsertDownload(recA)
    setWifiOnly(true)

    // Reset the module cache, prove a fresh empty store yields nothing...
    __resetDownloadsForTest()
    await hydrateDownloads(memoryStorage())
    expect(getDownloadsSnapshot().records).toEqual({})
    expect(getDownloadsSnapshot().wifiOnly).toBe(false)

    // ...then reload from the persisted store and confirm state came back.
    await hydrateDownloads(s)
    expect(getDownload('esv')).toEqual(recA)
    expect(getDownloadsSnapshot().wifiOnly).toBe(true)
  })

  it('ignores malformed persisted state', async () => {
    await hydrateDownloads(memoryStorage({ 'gc.downloads.v1': '{ not json' }))
    expect(getDownloadsSnapshot().records).toEqual({})
  })
})
