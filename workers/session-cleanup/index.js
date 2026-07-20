// Scheduled cleanup for live Sessions (see supabase/migrations/*_sessions.sql).
//
// Sessions are ephemeral: a row exists only while a session is live. This cron
// worker deletes (a) sessions the leader explicitly ended and (b) sessions that
// have gone quiet past an inactivity TTL (a crashed/abandoned leader). Deletes
// go through the Supabase REST API with the service-role key, which bypasses RLS
// — the sessions table intentionally has NO client DELETE policy.
//
// Required secrets (set with `wrangler secret put`):
//   SUPABASE_URL              — e.g. https://xyz.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service role (bypasses RLS for the delete)
// Optional var:
//   SESSION_TTL_HOURS         — inactivity TTL in hours (default 24)

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    // return=representation + select=id → the response body is the list of
    // deleted ids, so we can log how many rows each pass removed.
    Prefer: 'return=representation',
  }
}

async function deleteWhere(env, filter) {
  const url = `${env.SUPABASE_URL}/rest/v1/sessions?${filter}&select=id`
  const res = await fetch(url, { method: 'DELETE', headers: headers(env) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase DELETE ${filter} → ${res.status} ${body}`)
  }
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows.length : 0
}

async function cleanup(env) {
  const ttlHours = Number(env.SESSION_TTL_HOURS) || 24
  const cutoff = new Date(Date.now() - ttlHours * 3600 * 1000).toISOString()

  // Ended sessions: always safe to drop.
  const ended = await deleteWhere(env, 'status=eq.ended')
  // Live-but-abandoned: no activity within the TTL window.
  const stale = await deleteWhere(env, `last_active_at=lt.${encodeURIComponent(cutoff)}`)

  console.log(`session-cleanup: removed ${ended} ended + ${stale} stale (TTL ${ttlHours}h, cutoff ${cutoff})`)
  return { ended, stale }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      cleanup(env).catch((err) => {
        console.error('session-cleanup failed:', err && err.message ? err.message : err)
      }),
    )
  },
}
