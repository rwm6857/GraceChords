// POST /api/telegram/link
//   Body: { id, first_name, last_name?, username?, photo_url?, auth_date, hash }
//   Headers: Authorization: Bearer <supabase access token>
//   Verifies the Telegram Login Widget HMAC, then writes
//   users.telegram_user_id / telegram_linked_at for the signed-in user.
//
// DELETE /api/telegram/link
//   Headers: Authorization: Bearer <supabase access token>
//   Clears the telegram fields (no Telegram payload needed to unlink).
//
// The Telegram Login Widget is fired client-side via Telegram.Login.auth so
// we can read the user's Supabase session header instead of relying on a
// cookie redirect — Supabase JS keeps the session in localStorage, not in a
// cookie the Pages Function can read.

function json(body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
  return new Response(JSON.stringify(body), { ...init, headers })
}
function jsonError(msg, status) { return json({ error: msg }, { status }) }

function base64urlDecode(str) {
  const b = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b + '==='.slice((b.length + 3) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

async function verifySupabaseJwt(request, env) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return { error: 'Missing bearer token', status: 401 }
  }
  const token = auth.slice(7).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return { error: 'Invalid token format', status: 401 }
  const [headerB64, payloadB64, sigB64] = parts
  const secret = env.SUPABASE_JWT_SECRET
  if (!secret) return { error: 'Server not configured', status: 503 }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  )
  if (!ok) return { error: 'Invalid token signature', status: 401 }

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { error: 'Token expired', status: 401 }
  }
  if (!payload.sub) return { error: 'Token missing sub', status: 401 }
  return { userId: payload.sub }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

function bytesToHex(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

// Verify the Telegram Login Widget hash per
// https://core.telegram.org/widgets/login#checking-authorization
async function verifyTelegramHmac(payload, botToken) {
  const { hash, ...fields } = payload
  if (!hash || typeof hash !== 'string') return false

  const authDate = Number(fields.auth_date || 0)
  if (!Number.isFinite(authDate) || authDate <= 0) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 86400) return false

  const dataCheckString = Object.keys(fields)
    .filter(k => fields[k] !== undefined && fields[k] !== null && String(fields[k]).length > 0)
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n')

  const secretKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken))
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(dataCheckString),
  )
  const expected = bytesToHex(new Uint8Array(sig))
  return timingSafeEqual(expected, String(hash).toLowerCase())
}

async function supabasePatch(env, path, body) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
}

async function supabaseSelect(env, path) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': new URL(request.url).origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (request.method === 'GET') {
    // GET returns the current linked state so the profile page can render
    // without exposing the service-role key client-side.
    const auth = await verifySupabaseJwt(request, env)
    if (auth.error) return jsonError(auth.error, auth.status)

    const resp = await supabaseSelect(
      env,
      `users?select=telegram_user_id,telegram_linked_at&id=eq.${encodeURIComponent(auth.userId)}&limit=1`,
    )
    if (!resp.ok) {
      return jsonError(`Supabase query failed: ${resp.status}`, 502)
    }
    const rows = await resp.json()
    const row = Array.isArray(rows) && rows[0] ? rows[0] : { telegram_user_id: null, telegram_linked_at: null }
    return json({
      linked: row.telegram_user_id != null,
      telegram_user_id: row.telegram_user_id,
      telegram_linked_at: row.telegram_linked_at,
    })
  }

  if (request.method === 'DELETE') {
    const auth = await verifySupabaseJwt(request, env)
    if (auth.error) return jsonError(auth.error, auth.status)

    const resp = await supabasePatch(
      env,
      `users?id=eq.${encodeURIComponent(auth.userId)}`,
      { telegram_user_id: null, telegram_linked_at: null },
    )
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return jsonError(`Unlink failed: ${resp.status} ${text}`, 502)
    }
    return json({ linked: false })
  }

  if (request.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  const auth = await verifySupabaseJwt(request, env)
  if (auth.error) return jsonError(auth.error, auth.status)

  if (!env.TELEGRAM_BOT_TOKEN) {
    return jsonError('Server not configured', 503)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const tgId = Number(body?.id)
  if (!Number.isFinite(tgId) || tgId <= 0) {
    return jsonError('Missing Telegram id', 400)
  }

  const verified = await verifyTelegramHmac(body, env.TELEGRAM_BOT_TOKEN)
  if (!verified) {
    return jsonError('Telegram HMAC verification failed', 403)
  }

  const resp = await supabasePatch(
    env,
    `users?id=eq.${encodeURIComponent(auth.userId)}`,
    {
      telegram_user_id: tgId,
      telegram_linked_at: new Date().toISOString(),
    },
  )
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    if (resp.status === 409 || /telegram_user_id/.test(text)) {
      return jsonError('This Telegram account is already linked to another user', 409)
    }
    return jsonError(`Link failed: ${resp.status} ${text}`, 502)
  }

  return json({
    linked: true,
    telegram_user_id: tgId,
    telegram_linked_at: new Date().toISOString(),
  })
}
