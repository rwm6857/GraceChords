import { supabase } from './supabase'

// Send a song to the caller's linked Telegram chat via the existing web
// Pages Function POST /api/telegram/push (the bot worker renders and
// delivers server-side). Returns 'sent' on 202, 'not_linked' on 409 — the
// screen shows the link-your-Telegram alert for the latter.

export const TELEGRAM_BOT_URL = 'https://t.me/gracechords_bot'

const base = process.env.EXPO_PUBLIC_API_BASE_URL

function apiBase(): string {
  if (!base) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. ' +
        'Copy apps/mobile/.env.example to apps/mobile/.env and fill in the values.',
    )
  }
  return base.replace(/\/$/, '')
}

export async function pushSongToTelegram(opts: {
  songId: string
  key?: string
}): Promise<'sent' | 'not_linked'> {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) throw new Error('not_signed_in')

  const res = await fetch(`${apiBase()}/api/telegram/push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ song_id: opts.songId, key: opts.key || '' }],
      context: 'song',
    }),
  })

  if (res.status === 409) return 'not_linked'
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `telegram_failed_${res.status}`)
  }
  return 'sent'
}
