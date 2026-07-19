// Shared helpers for the /api/reflections/* Pages Functions (submit + report).
// Files prefixed with `_` are not routed by Cloudflare Pages, so the common JSON
// helpers, Supabase JWT verification, and the service-role REST helper live here
// in ONE place so the two routes can't drift. Mirrors the pattern in
// functions/api/export/_shared.js and functions/api/bot/_shared.js.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function json(body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function jsonError(msg, status, extra) {
  return json({ error: msg, ...(extra || {}) }, { status })
}

export function corsPreflight(request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': new URL(request.url).origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}

// Verify the caller's Supabase JWT via GoTrue (survives signing-key rotation, no
// local JWT secret). Returns { userId } or { error, status }.
export async function verifySupabaseJwt(request, env) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return { error: 'Missing bearer token', status: 401 }
  const token = auth.slice(7).trim()

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  })
  if (resp.status === 401) return { error: 'Invalid or expired token', status: 401 }
  if (!resp.ok) return { error: `Auth check failed: ${resp.status}`, status: 502 }
  const user = await resp.json().catch(() => null)
  if (!user?.id) return { error: 'Auth response missing user id', status: 502 }
  return { userId: user.id }
}

// Service-role PostgREST call (RLS bypassed — the caller is already authenticated
// and each endpoint enforces its own gating). `path` is everything after /rest/v1/.
export async function supabaseRest(env, path, init = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  }
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers })
}
