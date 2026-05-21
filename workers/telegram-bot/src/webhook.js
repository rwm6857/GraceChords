// Telegram webhook handler — DM flow only.
// Channel posts and group messages are ignored.

import { findUserByTelegramId } from './supabase.js'
import { checkRateLimit, formatCooldown } from './ratelimit.js'
import { parseRequest } from './parseRequest.js'
import { searchSongs, fetchSong, fetchSetlistSongs, classifyMatch } from './searchClient.js'
import {
  sendMessage,
  sendPhoto,
  sendDocument,
  sendMediaGroup,
  sendChatAction,
  answerCallbackQuery,
} from './telegram.js'
import { renderSongPdf, renderSetlistPdf, renderSongJpg } from './pdfRender.js'

const USER_CACHE_TTL_S = 5 * 60
const SETLIST_KV_TTL_S = 24 * 60 * 60

function onboardingText() {
  return [
    '👋 Welcome to GraceChords!',
    '',
    'I send chord charts as JPGs for you to use in the moment, or PDFs to download/share.',
    'To get started, link your GraceChords account to your Telegram so I know it\'s you.',
    '',
    '➡️ Open https://www.gracechords.com/profile and use the "Link Telegram" section.',
    '',
    'Once linked, just send me a song title (or a comma-separated setlist) and I\'ll do the rest.',
  ].join('\n')
}

async function getLinkedUser(env, telegramUserId) {
  const cacheKey = `userlookup:${telegramUserId}`
  if (env.BOT_KV) {
    const cached = await env.BOT_KV.get(cacheKey, 'json')
    if (cached) return cached.linked ? cached.user : null
  }
  const user = await findUserByTelegramId(env, telegramUserId)
  if (env.BOT_KV) {
    await env.BOT_KV.put(cacheKey, JSON.stringify({ linked: !!user, user }), {
      expirationTtl: USER_CACHE_TTL_S,
    })
  }
  return user
}

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

async function loadSetlistToken(env, token) {
  if (!env.BOT_KV) return null
  return env.BOT_KV.get(`setlist:${token}`, 'json')
}

function pdfCallbackData(songId, key) {
  return `pdf:${songId}:${key || ''}`
}

function pickCallbackData(songId, key) {
  return `pick:${songId}:${key || ''}`
}

function setlistPdfCallbackData(token) {
  return `slpdf:${token}`
}

async function sendSongJpgOrPdf({ env, chatId, song, key, label }) {
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
  })
}

async function sendSetlistResponse({ env, chatId, songs, keys }) {
  // Build per-song JPGs (best-effort). If any fail we fall back to PDF for
  // the whole set so the user always gets something usable.
  const media = []
  for (let i = 0; i < songs.length; i++) {
    const jpg = await renderSongJpg(env, songs[i], keys[i]).catch(() => null)
    if (!jpg) {
      const pdf = await renderSetlistPdf(env, songs, keys)
      await sendDocument(env.TELEGRAM_BOT_TOKEN, {
        chatId,
        document: pdf,
        filename: `setlist.pdf`,
        caption: 'Setlist',
      })
      return
    }
    media.push({
      jpg,
      filename: `${(songs[i].slug || songs[i].id || `song${i}`)}.png`,
      caption: i === 0 ? songs.map((s, idx) => `${idx + 1}. ${s.title}${keys[idx] ? ` (${keys[idx]})` : ''}`).join('\n') : undefined,
    })
  }

  // Telegram allows up to 10 in a single media group; chunk if needed.
  for (let start = 0; start < media.length; start += 10) {
    await sendMediaGroup(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      media: media.slice(start, start + 10),
    })
  }

  const items = songs.map((s, i) => ({ song_id: s.id, key: keys[i] || s.default_key || '' }))
  const token = await storeSetlistToken(env, items)
  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: chatId,
    text: 'Want it as one combined PDF?',
    reply_markup: {
      inline_keyboard: [[
        { text: '📄 Get setlist as PDF', callback_data: setlistPdfCallbackData(token) },
      ]],
    },
  })
}

async function handleTextMessage(env, ctx, message) {
  const chatId = message.chat.id
  const telegramUserId = message.from?.id
  const text = String(message.text || '').trim()

  if (!telegramUserId || !text) return

  // /start and /help — always responsive even when not linked.
  if (/^\/(start|help)\b/i.test(text)) {
    const user = await getLinkedUser(env, telegramUserId)
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: user
        ? `Hi ${user.display_name || ''}! Send me a song title (or "Song A in G, Song B" for a setlist) and I'll send the chord chart.`
        : onboardingText(),
    })
    return
  }

  const user = await getLinkedUser(env, telegramUserId)
  if (!user) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chat_id: chatId, text: onboardingText() })
    return
  }

  const limit = await checkRateLimit(env, telegramUserId)
  if (!limit.ok) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: `Whoa, slow down — try again in ${formatCooldown(limit.retryAfterSeconds)}.`,
    })
    return
  }

  const items = parseRequest(text)
  if (items.length === 0) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: "I couldn't read that. Try a title like \"Build My Life in G\".",
    })
    return
  }

  ctx.waitUntil(sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing').catch(() => {}))

  // Resolve each item to a concrete song (auto-pick or disambiguation).
  const resolved = []
  for (const item of items) {
    const results = await searchSongs(env, item.title).catch(() => [])
    const classified = classifyMatch(results)
    if (classified.kind === 'none') {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: `I couldn't find "${item.title}". Try a different spelling?`,
      })
      return
    }
    if (classified.kind === 'choose') {
      const keyboard = classified.candidates.map(c => ([{
        text: `${c.title}${c.artist ? ` — ${c.artist}` : ''}`,
        callback_data: pickCallbackData(c.id, item.key || ''),
      }]))
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: `Which "${item.title}" did you mean?`,
        reply_markup: { inline_keyboard: keyboard },
      })
      return
    }
    resolved.push({ id: classified.pick.id, key: item.key || classified.pick.default_key || '' })
  }

  if (resolved.length === 1) {
    const song = await fetchSong(env, resolved[0].id)
    await sendSongJpgOrPdf({ env, chatId, song, key: resolved[0].key })
    return
  }

  const songs = await fetchSetlistSongs(env, resolved.map(r => ({ song_id: r.id, key: r.key })))
  const keys = resolved.map(r => r.key)
  await sendSetlistResponse({ env, chatId, songs, keys })
}

async function handleCallbackQuery(env, ctx, cbq) {
  const chatId = cbq.message?.chat?.id
  const data = String(cbq.data || '')

  // Always acknowledge the button press fast.
  ctx.waitUntil(answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, cbq.id, '').catch(() => {}))

  if (!chatId) return

  if (data.startsWith('pdf:')) {
    const [, songId, key] = data.split(':')
    const song = await fetchSong(env, songId)
    const pdf = await renderSongPdf(env, song, key)
    await sendDocument(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      document: pdf,
      filename: `${(song.slug || song.id || 'song')}.pdf`,
      caption: `${song.title}${key ? ` — ${key}` : ''}`,
    })
    return
  }

  if (data.startsWith('pick:')) {
    const [, songId, key] = data.split(':')
    const song = await fetchSong(env, songId)
    await sendSongJpgOrPdf({ env, chatId, song, key })
    return
  }

  if (data.startsWith('slpdf:')) {
    const token = data.slice('slpdf:'.length)
    const stored = await loadSetlistToken(env, token)
    if (!stored?.items?.length) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: 'That setlist link expired — send the titles again to regenerate.',
      })
      return
    }
    const songs = await fetchSetlistSongs(env, stored.items)
    const keys = stored.items.map(i => i.key || '')
    const pdf = await renderSetlistPdf(env, songs, keys)
    await sendDocument(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      document: pdf,
      filename: `setlist.pdf`,
      caption: 'Setlist',
    })
    return
  }
}

export async function handleTelegramUpdate(env, ctx, update) {
  // DM-only. Anything else is silently ignored — channel/group flows are
  // handled by separate worker paths (digest, feature post).
  const message = update?.message
  const cbq = update?.callback_query

  if (cbq) {
    return handleCallbackQuery(env, ctx, cbq).catch(err => {
      console.warn('callback handler error', err)
    })
  }

  if (message?.chat?.type !== 'private') return
  if (typeof message.text !== 'string') return

  return handleTextMessage(env, ctx, message).catch(err => {
    console.warn('message handler error', err)
    return sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: message.chat.id,
      text: 'Something went wrong on my end. Try again in a moment.',
    }).catch(() => {})
  })
}
