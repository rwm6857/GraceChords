// Cached file_id store for chord-chart JPGs used in guest_message replies.
//
// answerGuestQuery cannot accept raw photo bytes — it wants either a hosted
// URL or a file_id from a prior bot upload. The simplest path that needs
// no external hosting is to upload the JPG once to a private "scratch"
// chat the bot can post to, capture the file_id Telegram returns, and
// reuse that file_id for any subsequent guest request for the same
// (song, key) pair.
//
// file_ids are bot-scoped and permanent in practice, so we cache them
// in KV with a long TTL. A KV miss falls through to a fresh upload.
//
// Requires env.MEDIA_STAGING_CHAT_ID — typically a one-person private
// channel containing only the bot. Falling back to DEV_CHANNEL_ID would
// pollute the user-facing announcement feed with chord charts, so we
// refuse instead and let the caller decide on a text fallback.

import { sendPhoto } from './telegram.js'

const FILE_ID_TTL_S = 30 * 24 * 60 * 60 // 30 days

function cacheKey(songId, key) {
  return `photoid:${songId}:${key || ''}`
}

// Pick the largest PhotoSize from a sendPhoto response. Telegram returns
// multiple sizes; the last entry is always the biggest.
function largestFileId(message) {
  const sizes = message?.photo
  if (!Array.isArray(sizes) || sizes.length === 0) return null
  return sizes[sizes.length - 1]?.file_id || null
}

export async function getOrStageFileId(env, { songId, key, jpg, filename, caption }) {
  const stagingChatId = env.MEDIA_STAGING_CHAT_ID
  if (!stagingChatId) {
    throw new Error('MEDIA_STAGING_CHAT_ID not configured; cannot stage photo for guest reply')
  }

  if (env.BOT_KV) {
    const hit = await env.BOT_KV.get(cacheKey(songId, key))
    if (hit) return { fileId: hit, cached: true }
  }

  const staged = await sendPhoto(env.TELEGRAM_BOT_TOKEN, {
    chatId: stagingChatId,
    photo: jpg,
    filename: filename || 'song.jpg',
    caption,
  })
  const fileId = largestFileId(staged)
  if (!fileId) {
    throw new Error('sendPhoto returned no file_id; cannot stage for guest reply')
  }

  if (env.BOT_KV) {
    await env.BOT_KV.put(cacheKey(songId, key), fileId, {
      expirationTtl: FILE_ID_TTL_S,
    })
  }
  return { fileId, cached: false }
}
