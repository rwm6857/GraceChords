// POST /api/export/setlist
//   Body: { items: [{ song_id: uuid, key?: string }] }  (max 25)
//   Headers: Authorization: Bearer <supabase access token>
//
// Renders a whole setlist to a single combined PDF, one song per page, using
// the same DOM-free pdf_mvp engine the single-song endpoint and the Telegram
// bot use. Returns application/pdf bytes. This is the multi-song counterpart
// to /api/export/song; there is intentionally no image scope for sets.
//
// Fonts: registers Noto from R2 (makeFontRegistrar) so output matches the
// browser + Telegram bot, falling back to Helvetica/Courier if R2 is absent.

import { renderMultiSongPdfBuffer } from '../../../src/utils/pdf_mvp/pure.js'
import { toRenderableSong } from '../../../src/utils/pdf_mvp/serverSong.js'
import { makeFontRegistrar } from '../../../src/utils/pdf_mvp/fontsR2.js'

// jsPDF references `window` in a couple of optional code paths. Provide a
// minimal shim before any pdf_mvp call. Safe in browsers (already exists).
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

const MAX_ITEMS = 25
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

async function fetchSongRows(env, ids) {
  const inList = ids.map((id) => encodeURIComponent(id)).join(',')
  const select = 'id,slug,title,artist,default_key,chordpro_content'
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/songs?select=${select}&id=in.(${inList})&is_deleted=eq.false`,
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

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const items = Array.isArray(body?.items) ? body.items : null
  if (!items || items.length === 0) return jsonError('items required', 400)
  if (items.length > MAX_ITEMS) return jsonError(`Too many items (max ${MAX_ITEMS})`, 400)

  const normalized = []
  for (const it of items) {
    const songId = typeof it?.song_id === 'string' ? it.song_id.trim() : ''
    if (!UUID_RE.test(songId)) return jsonError('each item.song_id must be a UUID', 400)
    const key = typeof it?.key === 'string' ? it.key.trim() : ''
    normalized.push({ song_id: songId, key })
  }

  // One query for all unique ids, then reorder to match the request (dropping
  // any id the query didn't return, e.g. soft-deleted since).
  const uniqueIds = [...new Set(normalized.map((n) => n.song_id))]
  const found = await fetchSongRows(env, uniqueIds)
  if (found.error) return jsonError(found.error, found.status)
  const rowById = new Map(found.rows.map((r) => [r.id, r]))

  const renderables = []
  for (const n of normalized) {
    const row = rowById.get(n.song_id)
    if (row) renderables.push(toRenderableSong(row, n.key))
  }
  if (renderables.length === 0) return jsonError('No songs found', 404)

  let pdf
  try {
    pdf = await renderMultiSongPdfBuffer(renderables, { registerFonts: makeFontRegistrar(env) })
  } catch (err) {
    return jsonError(`Render failed: ${err?.message || err}`, 500)
  }

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="setlist.pdf"',
    },
  })
}
