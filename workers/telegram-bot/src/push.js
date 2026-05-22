// Web-initiated chart delivery. The Pages Function at
// /api/telegram/push posts to /internal/push after verifying the
// caller's Supabase JWT and resolving their linked telegram_user_id.
//
// This module just hydrates the requested songs and hands off to the
// shared chart-delivery helpers — same code paths as the chat flow,
// so JPG/PDF fallback and inline buttons behave identically.

import { fetchSong, fetchSetlistSongs } from './searchClient.js'
import { sendSongJpgOrPdf, sendSetlistResponse } from './sendChart.js'

export async function pushToUser(env, { telegram_user_id, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items[] required')
  }

  // For a private chat with a bot, Telegram uses chat.id == user.id.
  // We store telegram_user_id on link, which is also the DM chat_id.
  const chatId = telegram_user_id

  if (items.length === 1) {
    const song = await fetchSong(env, items[0].song_id)
    const key = items[0].key || song.default_key || ''
    await sendSongJpgOrPdf({ env, chatId, song, key })
    return
  }

  const songs = await fetchSetlistSongs(env, items.map(i => ({ song_id: i.song_id, key: i.key || '' })))
  const keys = items.map(i => i.key || '')
  await sendSetlistResponse({ env, chatId, songs, keys })
}
