// POST /api/reflections/submit
//   Body: { body: string, reflection_date?: 'YYYY-MM-DD' }
//   Headers: Authorization: Bearer <supabase access token>
//
// The ONLY path that writes a visibility='public' reflection. The reflections
// own_insert RLS policy forbids public inserts, so this endpoint uses the
// service role — which guarantees moderation always runs before a public row
// exists. It authenticates the user, enforces one-public-per-day + the ±1-day
// window, checks the public_reflections kill switch and that the user isn't
// banned, runs moderateText() (fail-closed), and inserts only on pass.
//
// No client UI ships in this phase (2A); 2B's compose calls this endpoint.

import {
  corsPreflight,
  json,
  jsonError,
  supabaseRest,
  verifySupabaseJwt,
} from './_shared.js'
import { moderateText, ModerationUnavailable, MAX_LEN, MIN_LEN } from './_moderation.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Server "today" (UTC) as YYYY-MM-DD, plus a ±1-day window check.
function utcToday() {
  return new Date().toISOString().slice(0, 10)
}
function withinPostingWindow(dateStr) {
  const day = Date.parse(`${dateStr}T00:00:00Z`)
  const today = Date.parse(`${utcToday()}T00:00:00Z`)
  if (Number.isNaN(day)) return false
  const diffDays = Math.round((day - today) / 86400000)
  return diffDays >= -1 && diffDays <= 1
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') return corsPreflight(request)
  if (request.method !== 'POST') return jsonError('Method not allowed', 405)

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.OPENAI_API_KEY) {
    return jsonError('Server not configured', 503)
  }

  const auth = await verifySupabaseJwt(request, env)
  if (auth.error) return jsonError(auth.error, auth.status)

  let payload
  try {
    payload = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const body = typeof payload?.body === 'string' ? payload.body.trim() : ''
  if (body.length < MIN_LEN) return jsonError('body required', 400)
  if (body.length > MAX_LEN) return jsonError(`body exceeds ${MAX_LEN} characters`, 400)

  const reflectionDate = payload?.reflection_date || utcToday()
  if (!DATE_RE.test(reflectionDate)) return jsonError('reflection_date must be YYYY-MM-DD', 400)
  if (!withinPostingWindow(reflectionDate)) return jsonError('reflection_date outside posting window', 400)

  // Kill switch + ban gate (service-role reads; RLS irrelevant here).
  const flagResp = await supabaseRest(
    env,
    'feature_flags?select=enabled&key=eq.public_reflections&limit=1',
  )
  if (!flagResp.ok) return jsonError(`Flag check failed: ${flagResp.status}`, 502)
  const flagRows = await flagResp.json().catch(() => [])
  if (!flagRows?.[0]?.enabled) return jsonError('public_reflections_disabled', 403)

  const banResp = await supabaseRest(
    env,
    `banned_users?select=user_id&user_id=eq.${encodeURIComponent(auth.userId)}&limit=1`,
  )
  if (!banResp.ok) return jsonError(`Ban check failed: ${banResp.status}`, 502)
  const banRows = await banResp.json().catch(() => [])
  if (banRows?.length) return jsonError('banned', 403)

  // Moderation — fail closed. A ModerationUnavailable means we could not render a
  // verdict; never insert, return a retry-able 503.
  let verdict
  try {
    verdict = await moderateText(body, env)
  } catch (err) {
    if (err instanceof ModerationUnavailable) {
      return jsonError('moderation_unavailable', 503, { retryable: true })
    }
    return jsonError(`Moderation error: ${err?.message || err}`, 500)
  }
  if (!verdict.allowed) {
    return json({ allowed: false, reasons: verdict.reasons }, { status: 200 })
  }

  // Insert the public row (service role — bypasses the private-only own_insert).
  const insertResp = await supabaseRest(env, 'reflections', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: auth.userId,
      reflection_date: reflectionDate,
      body,
      visibility: 'public',
    }),
  })
  if (insertResp.status === 409) {
    return jsonError('already_posted_today', 409)
  }
  if (!insertResp.ok) {
    const text = await insertResp.text().catch(() => '')
    return jsonError(`Insert failed: ${insertResp.status} ${text}`.trim(), 502)
  }
  const rows = await insertResp.json().catch(() => [])
  const id = Array.isArray(rows) ? rows[0]?.id : rows?.id

  return json({ allowed: true, id }, { status: 201 })
}
