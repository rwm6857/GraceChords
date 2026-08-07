// POST /api/telegram/link-token
//   Headers: Authorization: Bearer <supabase access token>
//   Returns: { url, expires_in }
//
// Mints a short-lived, single-use token and returns the Telegram deep link that
// carries it. The app opens that URL; the user taps START; the bot redeems the
// token and writes the association. This is the NATIVE linking path — the
// Telegram Login Widget (see link.js) is browser-only and has no mobile
// equivalent, which is why this exists.
//
// The token is minted by the bot worker rather than here, because BOT_KV — the
// namespace it is stored in — is bound to that worker. This endpoint's job is
// the part the worker cannot do: prove who the caller is. It reuses
// BOT_INTERNAL_URL + BOT_WEBHOOK_TOKEN, both already configured for
// /api/telegram/push, so there is no new secret to provision or rotate.
//
// Status and unlink stay on link.js (GET / DELETE). Nothing here duplicates them.

// The bot username is not a secret and is already hardcoded in the web widget
// (components/TelegramLoginButton.jsx) and the mobile client
// (apps/mobile/src/lib/telegramPush.ts). Keep the three in step.
const BOT_USERNAME = 'gracechords_bot'

// Mirrors TTL_SECONDS in workers/telegram-bot/src/linkToken.js. Reported to the
// client so it can tell the user when a link has gone stale.
const TOKEN_TTL_SECONDS = 600

function json(body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
  return new Response(JSON.stringify(body), { ...init, headers })
}
function jsonError(msg, status) {
  return json({ error: msg }, { status })
}

// Same delegation as link.js: let Supabase validate the signature so this keeps
// working through JWT signing-key rotations without SUPABASE_JWT_SECRET in env.
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

  if (!env.BOT_INTERNAL_URL || !env.BOT_WEBHOOK_TOKEN) {
    return jsonError('Server not configured', 503)
  }

  const auth = await verifySupabaseJwt(request, env)
  if (auth.error) return jsonError(auth.error, auth.status)

  // Bounded like push.js: a misconfigured or unreachable worker must fail fast,
  // because someone is watching a spinner on a settings row.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  let botResp
  try {
    botResp = await fetch(`${env.BOT_INTERNAL_URL.replace(/\/$/, '')}/internal/link-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.BOT_WEBHOOK_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: auth.userId }),
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

  const body = await botResp.json().catch(() => null)
  if (!body?.token) {
    return jsonError('Bot response missing token', 502)
  }

  return json({
    url: `https://t.me/${BOT_USERNAME}?start=${body.token}`,
    expires_in: TOKEN_TTL_SECONDS,
  })
}
