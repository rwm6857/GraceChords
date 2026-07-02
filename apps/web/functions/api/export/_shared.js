// Shared helpers for the /api/export/* Pages Functions (single song + whole
// setlist). Files prefixed with `_` are not routed by Cloudflare Pages, so this
// is a safe place for the common JSON helpers, Supabase JWT verification, and
// the song-row fetch both endpoints use — keeping auth logic in ONE place so
// the two routes can't drift.

// jsPDF references `window` in a couple of optional code paths. Provide a
// minimal shim before any pdf_mvp call. Safe in browsers (already exists).
export function ensureWindowShim() {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis
  }
}

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

export async function verifySupabaseJwt(request, env) {
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

const SONG_SELECT = 'id,slug,title,artist,default_key,chordpro_content'

// Fetch songs by a service-role query (RLS bypassed; the caller is already
// authenticated). `filter` is a PostgREST filter clause, e.g.
// `id=eq.<uuid>` or `id=in.(<uuid>,<uuid>)`.
export async function fetchSongsByFilter(env, filter) {
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/songs?select=${SONG_SELECT}&${filter}&is_deleted=eq.false`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  if (!resp.ok) return { error: `Supabase query failed: ${resp.status}`, status: 502 }
  const rows = await resp.json().catch(() => null)
  if (!Array.isArray(rows)) return { error: 'Supabase returned no rows', status: 502 }
  return { rows }
}
