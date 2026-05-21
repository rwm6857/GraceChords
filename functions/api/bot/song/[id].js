import { json, jsonError, requireBearer, supabaseQuery } from '../_shared.js'

// Bot fetches the minimal song payload needed to render a PDF/JPG in the
// Worker: chordpro_content, default_key, title, artist, slug. The Worker
// then runs the pure pdf_mvp engine and rasterises page 1.

export async function onRequest(context) {
  const { request, env, params } = context

  if (request.method !== 'GET') {
    return jsonError('Method not allowed', 405)
  }

  const auth = requireBearer(request, env)
  if (!auth.ok) return auth.response

  const id = String(params.id || '').trim()
  if (!id) return jsonError('Missing song id', 400)

  // Accept either UUID or slug. UUID is `<8>-<4>-<4>-<4>-<12>` hex.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const filter = isUuid ? `id=eq.${encodeURIComponent(id)}` : `slug=eq.${encodeURIComponent(id)}`
  const select = 'id,slug,title,artist,default_key,chordpro_content,tags'
  const resp = await supabaseQuery(env, `songs?select=${select}&${filter}&is_deleted=eq.false&limit=1`, {
    method: 'GET',
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return jsonError(`Supabase query failed: ${resp.status} ${text}`, 502)
  }
  const rows = await resp.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return jsonError('Song not found', 404)
  }

  return json({ song: rows[0] })
}
