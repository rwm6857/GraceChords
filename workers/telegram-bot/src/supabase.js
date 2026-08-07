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

/**
 * Associate a Telegram account with a GraceChords user.
 *
 * THE WRITE IS DELIBERATELY NARROW. service_role bypasses RLS entirely, so the
 * only thing standing between this call and any column on public.users is the
 * body below — there is no policy backstop. Write telegram_user_id and
 * telegram_linked_at and nothing else, ever.
 *
 * REFUSES rather than transfers. users_telegram_user_id_key is UNIQUE
 * (20260521000000_telegram_link.sql:19, codified again in 20260806000000), so
 * pointing a second GraceChords account at an already-linked Telegram id fails
 * at the constraint and surfaces here as 'already_linked_elsewhere'. Do not
 * "fix" that by clearing the other row first: whoever most recently ran /start
 * would silently inherit the other account, which is exactly the takeover this
 * refusal exists to prevent.
 */
export async function linkTelegramAccount(env, { userId, telegramUserId }) {
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { ...headers(env), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({
        telegram_user_id: telegramUserId,
        telegram_linked_at: new Date().toISOString(),
      }),
    },
  )

  if (resp.ok) {
    const rows = await resp.json().catch(() => [])
    // An empty representation means the id matched no row — treat as failure
    // rather than reporting a link that does not exist.
    if (!Array.isArray(rows) || rows.length === 0) {
      return { status: 'error', detail: 'no matching user row' }
    }
    return { status: 'ok' }
  }

  const text = await resp.text().catch(() => '')
  // Same detection the web endpoint uses (functions/api/telegram/link.js:206).
  if (resp.status === 409 || /telegram_user_id/.test(text)) {
    return { status: 'already_linked_elsewhere' }
  }
  return { status: 'error', detail: `${resp.status} ${text}` }
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
