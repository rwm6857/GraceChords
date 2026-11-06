// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import { onRequest } from './[[path]].js'

const env = { VITE_R2_PUBLIC_URL: 'https://assets.example' }

function call(method, path, r2Status) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(r2Status === 200 ? 'deck' : 'nope', { status: r2Status }))
  vi.stubGlobal('fetch', fetchMock)
  const request = new Request(`https://gracechords.com/pptx/${path}`, { method })
  const params = { path: [path.split('?')[0]] }
  return onRequest({ request, env, params }).then((res) => ({ res, fetchMock }))
}

describe('functions/pptx exists check', () => {
  afterEach(() => vi.unstubAllGlobals())

  // Cloudflare's cache can forward the browser's HEAD as a GET, so the probe
  // must not depend on the method.
  test.each(['HEAD', 'GET'])('%s ?exists answers a missing deck with 204, not 404', async (method) => {
    const { res, fetchMock } = await call(method, 'nope.pptx?exists', 404)
    expect(res.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledWith('https://assets.example/pptx/nope.pptx', { method: 'HEAD' })
  })

  test('?exists answers an existing deck with an empty 200', async () => {
    const { res } = await call('GET', 'deck.pptx?exists', 200)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
  })

  test('a normal download is unchanged', async () => {
    const missing = await call('GET', 'nope.pptx', 404)
    expect(missing.res.status).toBe(404)
    const found = await call('GET', 'deck.pptx', 200)
    expect(found.res.status).toBe(200)
    expect(await found.res.text()).toBe('deck')
  })
})
