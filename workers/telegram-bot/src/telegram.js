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
// the bot has not joined). The exact accepted parameter set isn't published
// in the changelog yet, so this helper supports two modes and we try them
// empirically:
//   { photo, caption }  — multipart upload, mirrors sendPhoto's shape
//   { text }            — JSON, mirrors sendMessage's shape
// Returns a SentGuestMessage on success. Throws with the verbatim Telegram
// error response on failure — the caller inspects the error to decide
// whether to fall back to a different shape.
export async function answerGuestQuery(token, params = {}) {
  const { guestQueryId, photo, caption, text, filename } = params
  if (!guestQueryId) throw new Error('answerGuestQuery requires guestQueryId')

  if (photo) {
    const form = new FormData()
    form.append('guest_query_id', String(guestQueryId))
    if (caption) form.append('caption', caption)
    const blob = photo instanceof Uint8Array ? new Blob([photo], { type: 'image/jpeg' }) : photo
    form.append('photo', blob, filename || 'song.jpg')
    const resp = await fetch(botUrl(token, 'answerGuestQuery'), { method: 'POST', body: form })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data.ok) {
      throw new Error(`answerGuestQuery (photo) failed: ${resp.status} ${JSON.stringify(data)}`)
    }
    return data.result
  }

  return callJson(token, 'answerGuestQuery', {
    guest_query_id: guestQueryId,
    text: String(text || ''),
  })
}
