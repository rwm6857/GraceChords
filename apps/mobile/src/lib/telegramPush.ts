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
