import { json, jsonError, requireBearer, supabaseRpc } from '../_shared.js'

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'GET') {
    return jsonError('Method not allowed', 405)
  }

  const auth = requireBearer(request, env)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') || '8')))

  if (!q) {
    return json({ results: [] })
  }

  const resp = await supabaseRpc(env, 'bot_search_songs', { q, limit_count: limit })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    return jsonError(`Supabase RPC failed: ${resp.status} ${text}`, 502)
  }
  const rows = await resp.json()
  const results = (Array.isArray(rows) ? rows : []).map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    default_key: r.default_key,
    artist: r.artist,
    match_score: typeof r.score === 'number' ? r.score : Number(r.score || 0),
  }))

  return json({ results })
}
