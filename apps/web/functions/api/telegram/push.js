// POST /api/telegram/push
//   Body: { items: [{ song_id, key? }], context?: 'song' | 'setlist' }
//   Headers: Authorization: Bearer <supabase access token>
//
// Verifies the caller's Supabase JWT, looks up their linked
// telegram_user_id, and forwards to the bot worker at /internal/push
// using the shared BOT_WEBHOOK_TOKEN secret. The bot does the actual
// render + sendPhoto on its side (waitUntil), so this endpoint races
// the bot call against a short timeout: any synchronous validation
// error surfaces as 503, otherwise we return 202 and let the bot
// finish in the background.

function json(body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
  return new Response(JSON.stringify(body), { ...init, headers })
}
function jsonError(msg, status, extra) {
  return json({ error: msg, ...(extra || {}) }, { status })
}

async function verifySupabaseJwt(request, env) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return { error: 'Missing bearer token', status: 401 }
  }
  const token = auth.slice(7).trim()

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  if (resp.status === 401) return { error: 'Invalid or expired token', status: 401 }
  if (!resp.ok) return { error: `Auth check failed: ${resp.status}`, status: 502 }
  const user = await resp.json().catch(() => null)
  if (!user?.id) return { error: 'Auth response missing user id', status: 502 }
  return { userId: user.id }
}

async function supabaseSelect(env, path) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': new URL(request.url).origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (request.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  const auth = await verifySupabaseJwt(request, env)
  if (auth.error) return jsonError(auth.error, auth.status)

  if (!env.BOT_INTERNAL_URL || !env.BOT_WEBHOOK_TOKEN) {
    return jsonError('Server not configured', 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const items = Array.isArray(body?.items) ? body.items : null
  if (!items || items.length === 0) {
    return jsonError('items[] required', 400)
  }
  if (items.length > 25) {
    return jsonError('Too many items (max 25)', 400)
  }
  for (const it of items) {
    if (!it || typeof it.song_id !== 'string' || !UUID_RE.test(it.song_id)) {
      return jsonError('Each item needs a UUID song_id', 400)
    }
  }
  const context_ = body?.context === 'song' || body?.context === 'setlist' ? body.context : undefined

  const resp = await supabaseSelect(
    env,
    `users?select=telegram_user_id&id=eq.${encodeURIComponent(auth.userId)}&limit=1`,
  )
  if (!resp.ok) {
    return jsonError(`Supabase query failed: ${resp.status}`, 502)
  }
  const rows = await resp.json()
  const telegramUserId = Array.isArray(rows) && rows[0] ? rows[0].telegram_user_id : null
  if (telegramUserId == null) {
    return jsonError('needs_link', 409)
  }

  // Race the bot call against a short timeout so a misconfigured worker
  // doesn't hang the user. On success, the bot returns 200 quickly
  // because its own /internal/push uses waitUntil for the render.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  let botResp
  try {
    botResp = await fetch(`${env.BOT_INTERNAL_URL.replace(/\/$/, '')}/internal/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.BOT_WEBHOOK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        items: items.map(i => ({ song_id: i.song_id, key: i.key || '' })),
        context: context_,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    return jsonError(`Bot unreachable: ${err?.message || err}`, 503)
  }
  clearTimeout(timeout)

  if (!botResp.ok) {
    const text = await botResp.text().catch(() => '')
    return jsonError(`Bot returned ${botResp.status}: ${text}`.trim(), 502)
  }

  return json({ status: 'queued' }, { status: 202 })
}
