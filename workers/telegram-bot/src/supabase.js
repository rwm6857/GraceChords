// Minimal Supabase REST helpers — only what the worker needs directly
// (digest queries + Telegram user → user lookup). Bot song lookups go
// through the bearer-authed Pages Functions, NOT directly here.

function headers(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

async function get(env, path) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: headers(env),
  })
  if (!resp.ok) {
    throw new Error(`Supabase GET ${path} → ${resp.status}`)
  }
  return resp.json()
}

export async function findUserByTelegramId(env, telegramUserId) {
  const rows = await get(
    env,
    `users?select=id,display_name,telegram_user_id&telegram_user_id=eq.${encodeURIComponent(telegramUserId)}&limit=1`,
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

export async function listSongsSince(env, sinceIso) {
  return get(
    env,
    `songs?select=id,slug,title,artist,created_at&created_at=gt.${encodeURIComponent(sinceIso)}&is_deleted=eq.false&order=created_at.asc&limit=50`,
  )
}

export async function listPostsSince(env, sinceIso) {
  // Posts table may not have `published_at` on every project; we accept either
  // a published_at column or created_at as a fallback. Worker-side filtering
  // keeps the query simple.
  return get(
    env,
    `posts?select=id,slug,title,published_at,created_at&order=created_at.asc&limit=50&created_at=gt.${encodeURIComponent(sinceIso)}`,
  ).catch(() => [])
}
