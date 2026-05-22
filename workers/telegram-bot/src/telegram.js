// Minimal Telegram Bot API client. Only the verbs the bot actually uses.
// API reference: https://core.telegram.org/bots/api

const API_BASE = 'https://api.telegram.org'

function botUrl(token, method) {
  return `${API_BASE}/bot${token}/${method}`
}

async function callJson(token, method, body) {
  const resp = await fetch(botUrl(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${resp.status} ${JSON.stringify(data)}`)
  }
  return data.result
}

export async function sendMessage(token, params) {
  return callJson(token, 'sendMessage', params)
}

export async function getMe(token) {
  return callJson(token, 'getMe', {})
}

export async function sendChatAction(token, chatId, action = 'typing') {
  return callJson(token, 'sendChatAction', { chat_id: chatId, action })
}

export async function answerCallbackQuery(token, callbackQueryId, text = '') {
  return callJson(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  })
}

// sendPhoto with binary upload (multipart/form-data). Caption + chat_id +
// reply_markup are encoded as form fields alongside the photo blob.
export async function sendPhoto(token, { chatId, photo, filename = 'song.jpg', caption, replyMarkup, replyToMessageId } = {}) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  if (caption) form.append('caption', caption)
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup))
  if (replyToMessageId) form.append('reply_to_message_id', String(replyToMessageId))
  const blob = photo instanceof Uint8Array ? new Blob([photo], { type: 'image/jpeg' }) : photo
  form.append('photo', blob, filename)

  const resp = await fetch(botUrl(token, 'sendPhoto'), { method: 'POST', body: form })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.ok) {
    throw new Error(`Telegram sendPhoto failed: ${resp.status} ${JSON.stringify(data)}`)
  }
  return data.result
}

// sendDocument with binary upload — used for PDFs.
export async function sendDocument(token, { chatId, document, filename = 'song.pdf', mimeType = 'application/pdf', caption, replyToMessageId } = {}) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  if (caption) form.append('caption', caption)
  if (replyToMessageId) form.append('reply_to_message_id', String(replyToMessageId))
  const blob = document instanceof Uint8Array ? new Blob([document], { type: mimeType }) : document
  form.append('document', blob, filename)

  const resp = await fetch(botUrl(token, 'sendDocument'), { method: 'POST', body: form })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.ok) {
    throw new Error(`Telegram sendDocument failed: ${resp.status} ${JSON.stringify(data)}`)
  }
  return data.result
}

// sendMediaGroup with attached JPGs. media is an array of
// { jpg: Uint8Array, caption?: string }. Up to 10 entries per Telegram limit.
export async function sendMediaGroup(token, { chatId, media, replyToMessageId } = {}) {
  if (!Array.isArray(media) || media.length === 0) {
    throw new Error('sendMediaGroup requires at least one media item')
  }
  if (media.length > 10) {
    throw new Error('Telegram media group limit is 10')
  }

  const form = new FormData()
  form.append('chat_id', String(chatId))
  if (replyToMessageId) form.append('reply_to_message_id', String(replyToMessageId))

  const descriptors = media.map((item, idx) => {
    const name = `photo${idx}`
    const blob = item.jpg instanceof Uint8Array ? new Blob([item.jpg], { type: 'image/jpeg' }) : item.jpg
    form.append(name, blob, item.filename || `${name}.jpg`)
    return {
      type: 'photo',
      media: `attach://${name}`,
      ...(item.caption ? { caption: item.caption } : {}),
    }
  })
  form.append('media', JSON.stringify(descriptors))

  const resp = await fetch(botUrl(token, 'sendMediaGroup'), { method: 'POST', body: form })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data.ok) {
    throw new Error(`Telegram sendMediaGroup failed: ${resp.status} ${JSON.stringify(data)}`)
  }
  return data.result
}

// answerGuestQuery — reply to a guest_message delivery (mentions in chats
// the bot has not joined). The empirical probe in the earlier commit
// revealed two things from Telegram's error response ("result isn't
// specified"):
//   1. The reply payload is wrapped in a `result` field (singular), not
//      bare `text`/`photo` at the top level.
//   2. The method is JSON, not multipart — there's no top-level file
//      upload the way sendPhoto has.
//
// The exact `result` shape is still undocumented publicly, but the
// strongest precedent is answerInlineQuery, which takes InlineQueryResult
// objects. We send an InlineQueryResultArticle wrapping
// InputTextMessageContent for text replies. If Telegram returns a
// different error (e.g. demanding a different field name), the next
// iteration will refine the shape.
//
// Photo replies are deferred: the JPG renderer produces bytes, not a
// hosted URL, and InlineQueryResultPhoto needs a photo_url. We can add
// either an R2 upload step or a cached-file_id pattern once we know
// whether answerGuestQuery accepts those result types at all.
export async function answerGuestQuery(token, params = {}) {
  const { guestQueryId, text } = params
  if (!guestQueryId) throw new Error('answerGuestQuery requires guestQueryId')
  if (!text) throw new Error('answerGuestQuery requires text (photo path not yet supported)')

  const body = String(text)
  const result = {
    type: 'article',
    id: '1',
    title: body.split('\n')[0].slice(0, 64) || 'Reply',
    input_message_content: {
      message_text: body,
      disable_web_page_preview: false,
    },
  }

  return callJson(token, 'answerGuestQuery', {
    guest_query_id: guestQueryId,
    result,
  })
}
