// Shared helpers for the bot-only API routes under /api/bot/*.
// Every endpoint requires Authorization: Bearer ${env.BOT_API_TOKEN};
// the value is shared with the gracechords-telegram-bot Worker.

export function json(body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function jsonError(message, status = 400) {
  return json({ error: message }, { status })
}

export function requireBearer(request, env) {
  const expected = env.BOT_API_TOKEN
  if (!expected) {
    return { ok: false, response: jsonError('Server not configured', 503) }
  }
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return { ok: false, response: jsonError('Missing bearer token', 401) }
  }
  const token = auth.slice(7).trim()
  // Constant-time compare via Web Crypto-free fallback (lengths first, then
  // accumulating XOR on equal-length strings).
  if (token.length !== expected.length) {
    return { ok: false, response: jsonError('Unauthorized', 401) }
  }
  let mismatch = 0
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  if (mismatch !== 0) {
    return { ok: false, response: jsonError('Unauthorized', 401) }
  }
  return { ok: true }
}

export async function supabaseQuery(env, path, init = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  }
  return fetch(url, { ...init, headers })
}

export async function supabaseRpc(env, fn, body) {
  return supabaseQuery(env, `rpc/${fn}`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  })
}
