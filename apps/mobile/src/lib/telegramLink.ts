import { apiBase, apiError, apiRequest } from './api'

// Telegram account-link STATUS and UNLINK, against the web app's existing
// Pages Function (apps/web/functions/api/telegram/link.js). Both verbs are
// reused verbatim — nothing here forks the backend:
//
//   GET    /api/telegram/link → { linked, telegram_user_id, telegram_linked_at }
//   DELETE /api/telegram/link → clears both columns
//
// LINKING is not implemented natively yet. The only mechanism the backend
// supports today is the Telegram Login Widget, which is browser-only: it injects
// a script that calls back with an HMAC-signed payload, and there is no native
// equivalent. So the unlinked row hands off to the web profile, where that widget
// lives. The native bot `?start=<token>` flow that replaces this handoff ships
// separately (PR 2) because it changes the bot webhook, which is in daily use.
//
// No handle is available: the schema stores telegram_user_id (bigint) and
// telegram_linked_at only — there is no username column anywhere.

export type TelegramLinkState = {
  linked: boolean
  linkedAt: string | null
}

export const UNLINKED: TelegramLinkState = { linked: false, linkedAt: null }

/** The web profile's Telegram section, where the Login Widget is rendered. */
export function telegramProfileUrl(): string {
  try {
    return `${apiBase()}/profile#telegram`
  } catch {
    // apiBase() throws when EXPO_PUBLIC_API_BASE_URL is unset. Opening a help
    // link should never be the thing that crashes a settings screen.
    return 'https://www.gracechords.com/profile#telegram'
  }
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
