// @vitest-environment node
// Node's Request keeps the Origin header (happy-dom strips it as a browser
// would), which is what the Workers runtime does too.
import { isSameOrigin, onRequest, sanitizeReport } from './client-error.js'

describe('functions/api/client-error', () => {
  const url = 'https://gracechords.com/api/client-error'
  const good = { name: 'TypeError', message: 'boom', stack: 'at x', path: '/songs?q=1#t', source: 'test' }

  function post(body, headers = {}){
    return new Request(url, {
      method: 'POST',
      headers: { Origin: 'https://gracechords.com', 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  }

  test('sanitizeReport clips fields, drops non-strings and strips query/hash', () => {
    const r = sanitizeReport({ ...good, message: 'm'.repeat(900), userAgent: 42 })
    expect(r.message).toHaveLength(500)
    expect(r.userAgent).toBe('')
    expect(r.path).toBe('/songs')
    expect(sanitizeReport({ name: 'x' })).toBeNull()
    expect(sanitizeReport([1])).toBeNull()
  })

  test('isSameOrigin requires a matching Origin header', () => {
    expect(isSameOrigin(post(good))).toBe(true)
    expect(isSameOrigin(post(good, { Origin: 'https://evil.example' }))).toBe(false)
    expect(isSameOrigin(new Request(url, { method: 'POST' }))).toBe(false)
  })

  test('accepts a valid report, logs it, and stores it via the service-role RPC', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }))
    const original = global.fetch
    global.fetch = fetchSpy
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const env = { SUPABASE_URL: 'https://proj.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'srk' }
      const res = await onRequest({ request: post(good), env })
      expect(res.status).toBe(204)
      expect(errSpy).toHaveBeenCalledWith('[client-error]', expect.stringContaining('"path":"/songs"'))
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [calledUrl, init] = fetchSpy.mock.calls[0]
      expect(calledUrl).toBe('https://proj.supabase.co/rest/v1/rpc/log_client_error')
      expect(init.headers.Authorization).toBe('Bearer srk')
      const body = JSON.parse(init.body)
      expect(body.p_fingerprint).toMatch(/^[0-9a-f]{64}$/)
      expect(body).toMatchObject({ p_name: 'TypeError', p_message: 'boom', p_path: '/songs' })
    } finally {
      global.fetch = original
      errSpy.mockRestore()
    }
  })

  test('without Supabase config it still logs and returns 204, storing nothing', async () => {
    const fetchSpy = vi.fn()
    const original = global.fetch
    global.fetch = fetchSpy
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await onRequest({ request: post(good), env: {} })
      expect(res.status).toBe(204)
      expect(errSpy).toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      global.fetch = original
      errSpy.mockRestore()
    }
  })

  test('rejects wrong method, cross-origin, oversized and malformed requests', async () => {
    const env = {}
    expect((await onRequest({ request: new Request(url), env })).status).toBe(405)
    expect((await onRequest({ request: post(good, { Origin: 'https://evil.example' }), env })).status).toBe(403)
    expect((await onRequest({ request: post({ ...good, stack: 'x'.repeat(20000) }), env })).status).toBe(413)
    expect((await onRequest({ request: post('not json'), env })).status).toBe(400)
    expect((await onRequest({ request: post({ name: 'only' }), env })).status).toBe(400)
  })
})
