import { describe, it, expect, vi } from 'vitest'
import { fetchTextCached } from '../utils/network/fetchCache.js'

describe('fetchTextCached', () => {
  it('retries fetching after a failure', async () => {
    const url = '/test.txt'
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('ok')
      })
    globalThis.fetch = fetchMock

    await expect(fetchTextCached(url)).rejects.toThrow('fail')
    await expect(fetchTextCached(url)).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    globalThis.fetch = originalFetch
  })

  it('serves cached content when offline', async () => {
    const url = '/songs/test.txt'
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('ok')
    })
    globalThis.fetch = fetchMock

    await expect(fetchTextCached(url)).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const offlineFetch = vi.fn().mockRejectedValue(new Error('offline'))
    globalThis.fetch = offlineFetch

    await expect(fetchTextCached(url)).resolves.toBe('ok')
    expect(offlineFetch).not.toHaveBeenCalled()

    globalThis.fetch = originalFetch
  })
})

