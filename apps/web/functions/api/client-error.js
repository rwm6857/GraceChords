// POST /api/client-error
//   Body: { name, message, stack, componentStack, source, path, userAgent, release }
//
// Receives browser crash reports from src/utils/app/errorReporter.js. Every
// report is logged (Cloudflare Pages → Functions → real-time logs) and stored
// in Supabase's client_errors table via log_client_error(), which keeps one row
// per distinct error with a count and first/last-seen times (migration
// 20261105120000_client_errors.sql). Nothing is sent to Telegram.
//
// Unauthenticated by design — a crash can happen before or without sign-in —
// so the endpoint only accepts same-origin, size-capped JSON. The table caps
// itself at 5,000 distinct errors; pair this with a Cloudflare WAF rate-limiting
// rule on the path (see public/wiki/Production-Readiness.md).

const MAX_BODY_BYTES = 16 * 1024

const FIELDS = {
  name: 100,
  message: 500,
  stack: 4000,
  componentStack: 4000,
  source: 40,
  path: 300,
  userAgent: 300,
  release: 64,
}

function empty(status) {
  return new Response(null, { status })
}

export function sanitizeReport(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const report = {}
  for (const [key, max] of Object.entries(FIELDS)) {
    const value = payload[key]
    report[key] = typeof value === 'string' ? value.slice(0, max) : ''
  }
  if (!report.message && !report.stack) return null
  // The client already strips these; enforce it so a token can never be stored.
  report.path = report.path.split(/[?#]/)[0]
  return report
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export async function fingerprint(report) {
  const text = `${report.name}\n${report.message}\n${report.stack.slice(0, 500)}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function storeReport(env, report) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/log_client_error`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_fingerprint: await fingerprint(report),
        p_name: report.name,
        p_message: report.message,
        p_stack: report.stack,
        p_component_stack: report.componentStack,
        p_source: report.source,
        p_path: report.path,
        p_user_agent: report.userAgent,
        p_release: report.release,
      }),
    })
    if (!res.ok) console.error('[client-error] store failed', res.status, await res.text().catch(() => ''))
  } catch (err) {
    console.error('[client-error] store failed', err?.message || err)
  }
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') return empty(405)
  if (!isSameOrigin(request)) return empty(403)

  const declared = Number(request.headers.get('Content-Length') || 0)
  if (declared > MAX_BODY_BYTES) return empty(413)
  const text = await request.text().catch(() => '')
  if (text.length > MAX_BODY_BYTES) return empty(413)

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return empty(400)
  }
  const report = sanitizeReport(payload)
  if (!report) return empty(400)

  console.error('[client-error]', JSON.stringify(report))

  const work = storeReport(env, report)
  if (typeof context.waitUntil === 'function') context.waitUntil(work)
  else await work

  return empty(204)
}
