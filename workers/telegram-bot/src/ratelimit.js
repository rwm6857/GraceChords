// KV-backed sliding window rate limiter, 30 requests/hour/user.
// Uses two adjacent fixed windows (current + previous) so the effective
// rate stays near the configured limit at window boundaries. Same pattern
// as workers/pptx-upload/src/index.js.

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_PER_WINDOW = 30

export async function checkRateLimit(env, userId) {
  if (!env.BOT_KV) return { ok: true }

  const now = Date.now()
  const bucket = Math.floor(now / WINDOW_MS)
  const curKey = `rl:dm:${userId}:${bucket}`
  const prevKey = `rl:dm:${userId}:${bucket - 1}`

  const [curRaw, prevRaw] = await Promise.all([
    env.BOT_KV.get(curKey),
    env.BOT_KV.get(prevKey),
  ])
  const cur = Number(curRaw) || 0
  const prev = Number(prevRaw) || 0

  if (cur + prev >= MAX_PER_WINDOW) {
    const resetMs = ((bucket + 1) * WINDOW_MS) - now
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(resetMs / 1000)),
    }
  }

  // Best-effort increment; KV has no atomic ops but the per-user race
  // window is tiny and the cost of going over by 1-2 is negligible.
  await env.BOT_KV.put(curKey, String(cur + 1), {
    expirationTtl: Math.ceil(WINDOW_MS / 1000) * 2,
  })
  return { ok: true }
}

export function formatCooldown(retryAfterSeconds) {
  if (retryAfterSeconds < 60) return `${retryAfterSeconds}s`
  const minutes = Math.ceil(retryAfterSeconds / 60)
  return `${minutes}m`
}
