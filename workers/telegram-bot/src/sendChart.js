// Shared chart-delivery helpers. Used by both the chat-driven flow
// (webhook.js) and the web-driven flow (push.js → /internal/push).
//
// Keep render/send logic here so the two entry points stay byte-identical
// in formatting, captions, and inline-button wiring.

import { sendPhoto, sendDocument } from './telegram.js'
import { renderSongPdf, renderSetlistPdf, renderSongJpg } from './pdfRender.js'

const SETLIST_KV_TTL_S = 24 * 60 * 60

function shortId() {
  const a = new Uint8Array(8)
  crypto.getRandomValues(a)
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function storeSetlistToken(env, items) {
  const token = shortId()
  if (env.BOT_KV) {
    await env.BOT_KV.put(`setlist:${token}`, JSON.stringify({ items }), {
      expirationTtl: SETLIST_KV_TTL_S,
    })
  }
  return token
}

export function pdfCallbackData(songId, key) {
  return `pdf:${songId}:${key || ''}`
}

export function pickCallbackData(songId, key) {
  return `pick:${songId}:${key || ''}`
}

export function setlistPdfCallbackData(token) {
  return `slpdf:${token}`
}

export async function sendSongJpgOrPdf({ env, chatId, song, key, label, replyToMessageId }) {
  // Best-effort JPG. If the rasteriser isn't available (cold WASM, etc.)
  // fall back to sending the PDF directly.
  const jpg = await renderSongJpg(env, song, key).catch(() => null)
  const caption = label || `${song.title}${key ? ` — ${key}` : ''}`
  if (jpg) {
    await sendPhoto(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      photo: jpg,
      filename: `${(song.slug || song.id || 'song')}.png`,
      caption,
      replyToMessageId,
      replyMarkup: {
        inline_keyboard: [[
          { text: '📄 Get as PDF', callback_data: pdfCallbackData(song.id, key) },
        ]],
      },
    })
    return
  }
  const pdf = await renderSongPdf(env, song, key)
  await sendDocument(env.TELEGRAM_BOT_TOKEN, {
    chatId,
    document: pdf,
    filename: `${(song.slug || song.id || 'song')}.pdf`,
    caption,
    replyToMessageId,
  })
}

export async function sendSetlistResponse({ env, chatId, songs, keys, replyToMessageId }) {
  // Render each JPG up-front. If any fail we drop to a single combined
  // PDF for the whole set so the user always gets something usable.
  const jpgs = []
  for (let i = 0; i < songs.length; i++) {
    const jpg = await renderSongJpg(env, songs[i], keys[i]).catch(() => null)
    if (!jpg) {
      const pdf = await renderSetlistPdf(env, songs, keys)
      await sendDocument(env.TELEGRAM_BOT_TOKEN, {
        chatId,
        document: pdf,
        filename: `setlist.pdf`,
        caption: 'Setlist',
        replyToMessageId,
      })
      return
    }
    jpgs.push(jpg)
  }

  // Send each chart as its own sendPhoto so the final one can carry the
  // "Get setlist as PDF" inline button. sendMediaGroup would let us
  // collapse them into a side-by-side grid but doesn't accept
  // reply_markup, which would force a separate text message just to host
  // the button.
  const items = songs.map((s, i) => ({ song_id: s.id, key: keys[i] || s.default_key || '' }))
  const token = await storeSetlistToken(env, items)

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]
    const key = keys[i]
    const isLast = i === songs.length - 1
    const caption = `${i + 1}. ${song.title}${key ? ` — ${key}` : ''}`
    await sendPhoto(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      photo: jpgs[i],
      filename: `${(song.slug || song.id || `song${i}`)}.png`,
      caption,
      replyToMessageId: i === 0 ? replyToMessageId : undefined,
      replyMarkup: isLast ? {
        inline_keyboard: [[
          { text: '📄 Get setlist as PDF', callback_data: setlistPdfCallbackData(token) },
        ]],
      } : undefined,
    })
  }
}
