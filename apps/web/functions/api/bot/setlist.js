import { json, jsonError, requireBearer, supabaseQuery } from './_shared.js'

// Bot posts a setlist as { items: [{ song_id, key }] } and gets back the
// full per-song payloads (in order) so it can render either per-song JPGs
// or a combined PDF without making N follow-up calls.

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  const auth = requireBearer(request, env)
  if (!auth.ok) return auth.response

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

  const ids = items.map(i => String(i?.song_id || '').trim()).filter(Boolean)
  if (ids.length !== items.length) {
    return jsonError('Each item needs a song_id', 400)
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const allUuid = ids.every(id => uuidRe.test(id))
  if (!allUuid) {
    return jsonError('All song_ids must be UUIDs', 400)
  }

  const select = 'id,slug,title,artist,default_key,chordpro_content,tags'
  const inList = `(${ids.map(encodeURIComponent).join(',')})`
  const resp = await supabaseQuery(env, `songs?select=${select}&id=in.${inList}&is_deleted=eq.false`, {
    method: 'GET',
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return jsonError(`Supabase query failed: ${resp.status} ${text}`, 502)
  }
  const rows = await resp.json()
  const byId = new Map((Array.isArray(rows) ? rows : []).map(r => [r.id, r]))

  const ordered = []
  const missing = []
  for (const item of items) {
    const row = byId.get(item.song_id)
    if (!row) {
      missing.push(item.song_id)
      continue
    }
    ordered.push({ ...row, requested_key: item.key || row.default_key || '' })
  }

  if (missing.length) {
    return jsonError(`Songs not found: ${missing.join(', ')}`, 404)
  }

  return json({ songs: ordered })
}
