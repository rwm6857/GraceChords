#!/usr/bin/env node
// Production smoke test: domain, TLS, redirects, security headers, key routes,
// SEO files, deep-link files and the crash-report endpoint.
//
//   npm run smoke:prod                 (checks https://gracechords.com)
//   SMOKE_ORIGIN=https://<hash>.gracechords.pages.dev npm run smoke:prod
//
// Exits 1 if any check fails, so it can gate a CI job
// (.github/workflows/prod-smoke.yml). Read-only apart from one POST to
// /api/client-error with a foreign Origin, which the endpoint must refuse.
import tls from 'node:tls'

const ORIGIN = (process.env.SMOKE_ORIGIN || 'https://gracechords.com').replace(/\/$/, '')
const HOST = new URL(ORIGIN).host
const IS_PROD_DOMAIN = HOST === 'gracechords.com'
const MIN_CERT_DAYS = 14

const results = []
async function check(name, fn){
  try {
    const detail = await fn()
    results.push({ ok: true, name, detail })
  } catch (err) {
    results.push({ ok: false, name, detail: err.message || String(err) })
  }
}
function assert(cond, message){ if (!cond) throw new Error(message) }
const get = (path, init = {}) => fetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init })

function certDaysLeft(host){
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      if (!socket.authorized) return reject(new Error(`certificate not trusted: ${socket.authorizationError}`))
      resolve({ days: Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000), issuer: cert.issuer?.O || '?' })
    })
    socket.on('timeout', () => { socket.destroy(); reject(new Error('TLS timeout')) })
    socket.on('error', reject)
  })
}

let homeHtml = ''

await check('TLS certificate valid and not expiring soon', async () => {
  const { days, issuer } = await certDaysLeft(HOST)
  assert(days >= MIN_CERT_DAYS, `expires in ${days} days`)
  return `${days} days left (${issuer})`
})

if (IS_PROD_DOMAIN) {
  await check('http:// redirects to https://', async () => {
    const res = await fetch(`http://${HOST}/`, { redirect: 'manual' })
    const loc = res.headers.get('location') || ''
    assert([301, 302, 307, 308].includes(res.status), `status ${res.status}`)
    assert(loc.startsWith('https://'), `Location ${loc || '(none)'}`)
    return `${res.status} → ${loc}`
  })
}

await check('home page serves the app shell', async () => {
  const res = await get('/')
  assert(res.status === 200, `status ${res.status}`)
  homeHtml = await res.text()
  assert(homeHtml.includes('GraceChords'), 'missing app name')
  assert(/<script[^>]+type="module"[^>]+\/assets\/index-/.test(homeHtml), 'no hashed entry script')
  assert(!homeHtml.includes('%VITE_'), 'un-replaced %VITE_* placeholder in index.html')
  return '200'
})

await check('security headers present', async () => {
  const res = await get('/')
  const h = (n) => res.headers.get(n) || ''
  const missing = []
  if (!/frame-ancestors 'none'/.test(h('content-security-policy'))) missing.push('CSP frame-ancestors')
  if (h('x-content-type-options') !== 'nosniff') missing.push('X-Content-Type-Options')
  if (!h('referrer-policy')) missing.push('Referrer-Policy')
  if (!/max-age=\d+/.test(h('strict-transport-security'))) missing.push('HSTS')
  if (!h('permissions-policy')) missing.push('Permissions-Policy')
  assert(missing.length === 0, `missing: ${missing.join(', ')}`)
  return 'ok'
})

await check('hashed assets are long-cached', async () => {
  const m = homeHtml.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
  assert(m, 'no entry asset found in home HTML')
  const res = await get(m[0], { method: 'HEAD' })
  assert(res.status === 200, `status ${res.status}`)
  const cc = res.headers.get('cache-control') || ''
  assert(/immutable/.test(cc), `Cache-Control: ${cc || '(none)'}`)
  return cc
})

for (const path of ['/songs', '/privacy', '/terms', '/delete-account', '/download']) {
  await check(`${path} returns 200`, async () => {
    const res = await get(path, { redirect: 'follow' })
    assert(res.status === 200, `status ${res.status}`)
    return '200'
  })
}

await check('unknown path returns HTTP 404', async () => {
  const res = await get(`/smoke-test-missing-${Date.now()}`)
  assert(res.status === 404, `status ${res.status} (expected 404)`)
  return '404'
})

await check('robots.txt and sitemap.xml', async () => {
  const robots = await (await get('/robots.txt')).text()
  assert(/Sitemap:\s*https:\/\/gracechords\.com\/sitemap\.xml/.test(robots), 'robots.txt has no Sitemap line')
  const res = await get('/sitemap.xml')
  assert(res.status === 200, `sitemap status ${res.status}`)
  const xml = await res.text()
  const count = (xml.match(/<loc>/g) || []).length
  assert(count > 10, `sitemap has only ${count} URLs`)
  return `${count} URLs`
})

await check('mobile deep-link files served as JSON', async () => {
  for (const path of ['/.well-known/apple-app-site-association', '/.well-known/assetlinks.json']) {
    const res = await get(path)
    assert(res.status === 200, `${path} status ${res.status}`)
    assert(/application\/json/.test(res.headers.get('content-type') || ''), `${path} content-type ${res.headers.get('content-type')}`)
  }
  return 'ok'
})

await check('crash-report endpoint is deployed and refuses foreign origins', async () => {
  const res = await get('/api/client-error', {
    method: 'POST',
    headers: { Origin: 'https://smoke-test.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert(res.status === 403, `status ${res.status} (expected 403)`)
  return '403'
})

let failed = 0
for (const r of results) {
  if (!r.ok) failed += 1
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log(`\n${results.length - failed}/${results.length} checks passed against ${ORIGIN}`)
process.exit(failed ? 1 : 0)
