// Stage a chord-chart JPG so we can answer a guest_message with a file_id.
//
// answerGuestQuery cannot accept raw photo bytes — it wants either a hosted
// URL or a file_id from a prior bot upload. The simplest path that needs
// no external hosting is to upload the JPG to a private "scratch" chat
// the bot can post to, capture the file_id Telegram returns, then delete
// the staging message so the channel stays clean.
//
// No caching: every guest request re-stages. This trades one extra
// Telegram API round-trip per request for instant freshness on lyric/
// chord edits and zero KV usage. For low-volume worship traffic the cost
// is negligible.
//
// Requires env.MEDIA_STAGING_CHAT_ID — typically a one-person private
// channel containing only the bot, with both Post and Delete permissions.

import { sendPhoto, sendDocument } from './telegram.js'

// Pick the largest PhotoSize from a sendPhoto response. Telegram returns
// multiple sizes; the last entry is always the biggest.
function largestFileId(message) {
  const sizes = message?.photo
  if (!Array.isArray(sizes) || sizes.length === 0) return null
  return sizes[sizes.length - 1]?.file_id || null
}

export async function stagePhoto(env, { jpg, filename, caption }) {
  const stagingChatId = env.MEDIA_STAGING_CHAT_ID
  if (!stagingChatId) {
    throw new Error('MEDIA_STAGING_CHAT_ID not configured; cannot stage photo for guest reply')
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
  return { fileId, chatId: stagingChatId, messageId: staged.message_id }
}

// Same idea as stagePhoto but for a PDF, so a guest setlist can be answered
// with an InlineQueryResultCachedDocument. Returns the document file_id plus
// the staging message coordinates so the caller can delete it afterward.
export async function stageDocument(env, { pdf, filename, caption }) {
  const stagingChatId = env.MEDIA_STAGING_CHAT_ID
  if (!stagingChatId) {
    throw new Error('MEDIA_STAGING_CHAT_ID not configured; cannot stage document for guest reply')
  }

  const staged = await sendDocument(env.TELEGRAM_BOT_TOKEN, {
    chatId: stagingChatId,
    document: pdf,
    filename: filename || 'setlist.pdf',
    caption,
  })
  const fileId = staged?.document?.file_id
  if (!fileId) {
    throw new Error('sendDocument returned no file_id; cannot stage for guest reply')
  }
  return { fileId, chatId: stagingChatId, messageId: staged.message_id }
}
