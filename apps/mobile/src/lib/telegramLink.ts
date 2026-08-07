import { apiError, apiPost, apiRequest } from './api'

// Telegram account linking, against the web app's Pages Functions:
//
//   GET    /api/telegram/link       → { linked, telegram_user_id, telegram_linked_at }
//   DELETE /api/telegram/link       → clears both columns
//   POST   /api/telegram/link-token → { url, expires_in } — the native handoff
//
// The link URL is a `t.me` deep link carrying a short-lived, single-use token.
// Opening it launches Telegram on the bot; the user taps START; the bot redeems
// the token and writes the association. `t.me` is a Telegram universal link, so
// it opens the installed app directly and falls back to the web client
// otherwise — there is no `tg://` probe and so no LSApplicationQueriesSchemes
// entry or native rebuild.
//
// The app cannot observe the outcome: the association happens inside Telegram
// and is written server-side. Callers refetch status on focus and on the
// foreground transition instead.
//
// No handle is available: the schema stores telegram_user_id (bigint) and
// telegram_linked_at only — there is no username column anywhere.

export type TelegramLinkState = {
  linked: boolean
  linkedAt: string | null
}

export const UNLINKED: TelegramLinkState = { linked: false, linkedAt: null }

/**
 * Mint a link token and return the Telegram URL that carries it.
 *
 * Minted per tap rather than cached: the token lives ten minutes and is burned
 * on first use, so a stale one would fail silently inside Telegram where we
 * cannot see it or explain it.
 */
export async function startTelegramLink(): Promise<string> {
  const res = await apiPost('/api/telegram/link-token', {})
  if (!res.ok) throw await apiError(res, 'telegram_link_token_failed')
  const body = (await res.json()) as { url?: string }
  if (!body?.url) throw new Error('telegram_link_token_failed')
  return body.url
}

export async function fetchTelegramLink(): Promise<TelegramLinkState> {
  const res = await apiRequest('GET', '/api/telegram/link')
  if (!res.ok) throw await apiError(res, 'telegram_status_failed')
  const body = (await res.json()) as {
    linked?: boolean
    telegram_linked_at?: string | null
  }
  return {
    linked: Boolean(body?.linked),
    linkedAt: body?.telegram_linked_at ?? null,
  }
}

export async function unlinkTelegram(): Promise<void> {
  const res = await apiRequest('DELETE', '/api/telegram/link')
  if (!res.ok) throw await apiError(res, 'telegram_unlink_failed')
}
