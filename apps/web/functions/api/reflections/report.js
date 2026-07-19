// POST /api/reflections/report
//   Body: { reflection_id: uuid, reason?: string }
//   Headers: Authorization: Bearer <supabase access token>
//
// Records a report (service role) and fires a Telegram alert to the admin dev
// channel via the bot worker's /internal/report-alert route (same Pages-Function
// -> bot-worker pattern as /api/telegram/push). The report row is the source of
// truth; the alert is best-effort — a failed alert never fails the user's report
// (the row is already saved and readable in the dashboard).
//
// The reflections `reports` table also has an insert-own RLS policy, but the
// alert only fires when a report goes through THIS endpoint — 2B's report button
// calls it. No client UI ships in this phase (2A).

import {
  corsPreflight,
  json,
  jsonError,
  supabaseRest,
  UUID_RE,
  verifySupabaseJwt,
} from './_shared.js'

const PREVIEW_LEN = 200

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') return corsPreflight(request)
  if (request.method !== 'POST') return jsonError('Method not allowed', 405)

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
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

  const reflectionId = typeof payload?.reflection_id === 'string' ? payload.reflection_id : ''
  if (!UUID_RE.test(reflectionId)) return jsonError('reflection_id (uuid) required', 400)
  const reason =
    typeof payload?.reason === 'string' ? payload.reason.slice(0, 500).trim() || null : null

  // Record the report (service role).
  const insertResp = await supabaseRest(env, 'reports', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      reflection_id: reflectionId,
      reporter_id: auth.userId,
      reason,
    }),
  })
  if (!insertResp.ok) {
    const text = await insertResp.text().catch(() => '')
    return jsonError(`Report insert failed: ${insertResp.status} ${text}`.trim(), 502)
  }

  // Look up the reported reflection so the alert carries what the admin needs.
  const refResp = await supabaseRest(
    env,
    `reflections?select=body,user_id,reflection_date&id=eq.${encodeURIComponent(reflectionId)}&limit=1`,
  )
  const refRows = refResp.ok ? await refResp.json().catch(() => []) : []
  const reflection = refRows?.[0] || null

  // Best-effort admin alert via the bot worker.
  let alert = 'skipped'
  if (env.BOT_INTERNAL_URL && env.BOT_WEBHOOK_TOKEN) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const alertResp = await fetch(
        `${env.BOT_INTERNAL_URL.replace(/\/$/, '')}/internal/report-alert`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.BOT_WEBHOOK_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reflection_id: reflectionId,
            author_id: reflection?.user_id || null,
            reflection_date: reflection?.reflection_date || null,
            reason,
            preview: (reflection?.body || '').slice(0, PREVIEW_LEN),
          }),
          signal: controller.signal,
        },
      )
      alert = alertResp.ok ? 'sent' : 'failed'
    } catch {
      alert = 'failed'
    } finally {
      clearTimeout(timeout)
    }
  }

  return json({ status: 'reported', alert }, { status: 202 })
}
