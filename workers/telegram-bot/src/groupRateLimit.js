// Per-chat cooldown for group/guest-chat requests. Intentionally lenient —
// the goal is to prevent a single chat from flooding the renderer, not to
// throttle normal worship-team use. Pairs with the per-user DM limiter in
// ratelimit.js; the two are independent.
//
// Tuning: a chat can request up to GROUP_MAX_PER_WINDOW renders within
// GROUP_WINDOW_MS. Numbers chosen so a band can ping the bot for a normal
// setlist (~10 songs in a media group counts as one request) plus a few
// extra one-offs without ever hitting the limit.

const GROUP_WINDOW_MS = 60 * 1000 // 1 minute
const GROUP_MAX_PER_WINDOW = 6

export async function checkGroupRateLimit(env, chatId) {
  if (!env.BOT_KV) return { ok: true }

  const now = Date.now()
  const bucket = Math.floor(now / GROUP_WINDOW_MS)
  const key = `rl:grp:${chatId}:${bucket}`
  const raw = await env.BOT_KV.get(key)
  const count = Number(raw) || 0

  if (count >= GROUP_MAX_PER_WINDOW) {
    const resetMs = ((bucket + 1) * GROUP_WINDOW_MS) - now
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(resetMs / 1000)),
    }
  }

  await env.BOT_KV.put(key, String(count + 1), {
    expirationTtl: Math.ceil(GROUP_WINDOW_MS / 1000) * 2,
  })
  return { ok: true }
}
