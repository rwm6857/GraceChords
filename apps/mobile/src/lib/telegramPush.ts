import { apiError, apiPost } from './api'

// Send a song to the caller's linked Telegram chat via the existing web
// Pages Function POST /api/telegram/push (the bot worker renders and
// delivers server-side). Returns 'sent' on 202, 'not_linked' on 409 — the
// screen shows the link-your-Telegram alert for the latter.

export const TELEGRAM_BOT_URL = 'https://t.me/gracechords_bot'

export async function pushSongToTelegram(opts: {
  songId: string
  key?: string
}): Promise<'sent' | 'not_linked'> {
  const res = await apiPost('/api/telegram/push', {
    items: [{ song_id: opts.songId, key: opts.key || '' }],
    context: 'song',
  })

  if (res.status === 409) return 'not_linked'
  if (!res.ok) throw await apiError(res, 'telegram_failed')
  return 'sent'
}

// Same endpoint, multi-item: send a whole setlist (the API accepts items[]
// with context 'setlist'). The endpoint caps a request at 25 items, so
// longer sets go out in order as multiple requests.
const TELEGRAM_MAX_ITEMS = 25

export async function pushSetToTelegram(
  items: Array<{ songId: string; key?: string | null }>,
): Promise<'sent' | 'not_linked'> {
  const payload = items.map((item) => ({ song_id: item.songId, key: item.key || '' }))
  for (let i = 0; i < payload.length; i += TELEGRAM_MAX_ITEMS) {
    const res = await apiPost('/api/telegram/push', {
      items: payload.slice(i, i + TELEGRAM_MAX_ITEMS),
      context: 'setlist',
    })
    if (res.status === 409) return 'not_linked'
    if (!res.ok) throw await apiError(res, 'telegram_failed')
  }
  return 'sent'
}
