// Telegram webhook handler — routes DM messages, group/guest-chat @mentions,
// and inline-button callback queries. Channel posts and edited messages are
// silently ignored.

import { findUserByTelegramId } from './supabase.js'
import { checkRateLimit, formatCooldown } from './ratelimit.js'
import { checkGroupRateLimit } from './groupRateLimit.js'
import { parseRequest } from './parseRequest.js'
import { searchSongs, fetchSong, fetchSetlistSongs, classifyMatch } from './searchClient.js'
import {
  sendMessage,
  sendPhoto,
  sendDocument,
  sendMediaGroup,
  sendChatAction,
  answerCallbackQuery,
  getMe,
} from './telegram.js'
import { renderSongPdf, renderSetlistPdf, renderSongJpg } from './pdfRender.js'

// Bot username is needed to detect @mentions in group chats. Cache once
// per isolate — getMe() is a single Telegram round-trip and the username
// only changes if the maintainer renames the bot via BotFather.
let cachedBotUsername = null
async function getBotUsername(env) {
  if (cachedBotUsername) return cachedBotUsername
  try {
    const me = await getMe(env.TELEGRAM_BOT_TOKEN)
    cachedBotUsername = (me?.username || '').toLowerCase()
    console.info('[grp] getMe ok', { username: cachedBotUsername })
  } catch (err) {
    console.warn('[grp] getMe failed', err?.message || err)
    cachedBotUsername = ''
  }
  return cachedBotUsername
}

// Pulls out the @bot mention (if any) and returns the remaining text. Only
// returns non-null when this message is actually directed at the bot.
function extractMentionPayload(message, botUsername) {
  if (!botUsername) {
    console.warn('[grp] mention check: empty botUsername')
    return null
  }
  const text = String(message?.text || '')
  const entities = Array.isArray(message?.entities) ? message.entities : []
  const want = `@${botUsername}`.toLowerCase()
  console.info('[grp] mention scan', {
    want,
    entityCount: entities.length,
    entityTypes: entities.map(e => e.type),
    textPreview: text.slice(0, 80),
  })
  for (const ent of entities) {
    if (ent.type !== 'mention') continue
    const slice = text.slice(ent.offset, ent.offset + ent.length).toLowerCase()
    if (slice !== want) {
      console.info('[grp] mention slice mismatch', { slice, want })
      continue
    }
    const before = text.slice(0, ent.offset)
    const after = text.slice(ent.offset + ent.length)
    const payload = (before + ' ' + after).replace(/\s+/g, ' ').trim()
    console.info('[grp] mention matched', { payload })
    return payload
  }
  console.info('[grp] no matching mention entity')
  return null
}

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

async function sendSongJpgOrPdf({ env, chatId, song, key, label, replyToMessageId }) {
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

async function sendSetlistResponse({ env, chatId, songs, keys, replyToMessageId }) {
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
        replyToMessageId,
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
  // Only thread the first chunk back to the originating message.
  for (let start = 0; start < media.length; start += 10) {
    await sendMediaGroup(env.TELEGRAM_BOT_TOKEN, {
      chatId,
      media: media.slice(start, start + 10),
      replyToMessageId: start === 0 ? replyToMessageId : undefined,
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

async function handleTextMessage(env, ctx, message, options = {}) {
  // options.text       — pre-cleaned text (mention stripped) for group flow.
  // options.isGroup    — true for group/supergroup/guest-chat messages.
  // options.replyToMessageId — message_id to thread replies under in groups.
  const chatId = message.chat.id
  const telegramUserId = message.from?.id
  const text = String(options.text ?? message.text ?? '').trim()
  const isGroup = !!options.isGroup
  const replyToMessageId = options.replyToMessageId

  if (!telegramUserId || !text) return

  // /start and /help — always responsive even when not linked. In groups
  // we keep the message short to avoid spamming the chat with onboarding.
  if (/^\/(start|help)\b/i.test(text)) {
    if (isGroup) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: 'Mention me with a song title (e.g. "@gracechords_bot Build My Life in G") and I\'ll drop the chord chart in the chat.',
        reply_to_message_id: replyToMessageId,
      })
      return
    }
    const user = await getLinkedUser(env, telegramUserId)
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: user
        ? `Hi ${user.display_name || ''}! Send me a song title (or "Song A in G, Song B" for a setlist) and I'll send the chord chart.`
        : onboardingText(),
    })
    return
  }

  // Account-link gating is DM-only. In a group chat anyone can summon the
  // bot — we still rate-limit per chat so a single group can't flood.
  if (!isGroup) {
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
  } else {
    const groupLimit = await checkGroupRateLimit(env, chatId)
    if (!groupLimit.ok) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: `Busy chat — try again in ${formatCooldown(groupLimit.retryAfterSeconds)}.`,
        reply_to_message_id: replyToMessageId,
      })
      return
    }
  }

  const items = parseRequest(text)
  if (items.length === 0) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: "I couldn't read that. Try a title like \"Build My Life in G\".",
      reply_to_message_id: replyToMessageId,
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
        reply_to_message_id: replyToMessageId,
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
        reply_to_message_id: replyToMessageId,
      })
      return
    }
    resolved.push({ id: classified.pick.id, key: item.key || classified.pick.default_key || '' })
  }

  if (resolved.length === 1) {
    const song = await fetchSong(env, resolved[0].id)
    await sendSongJpgOrPdf({ env, chatId, song, key: resolved[0].key, replyToMessageId })
    return
  }

  const songs = await fetchSetlistSongs(env, resolved.map(r => ({ song_id: r.id, key: r.key })))
  const keys = resolved.map(r => r.key)
  await sendSetlistResponse({ env, chatId, songs, keys, replyToMessageId })
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
  // Four flows:
  //   private chat   → full DM experience (account link, per-user limit).
  //   group / super  → only respond to @mentions, per-chat limit, no link.
  //   guest_message  → Telegram delivers mentions from chats the bot has
  //                    not joined under update.guest_message (separate top-
  //                    level field from update.message). Treated as group.
  //   anything else  → silently ignore.
  const cbq = update?.callback_query

  if (cbq) {
    return handleCallbackQuery(env, ctx, cbq).catch(err => {
      console.warn('callback handler error', err)
    })
  }

  // Accept either the standard message envelope or the guest_message one.
  // Track which envelope we got so downstream logic can force the group
  // flow for guest deliveries regardless of chat.type.
  const message = update?.message ?? update?.guest_message
  const isGuest = !update?.message && !!update?.guest_message

  // Top-level breadcrumb: prints the keys of the update so we can see what
  // Telegram actually delivered (message vs channel_post vs edited_* etc.).
  console.info('[grp] update', {
    keys: Object.keys(update || {}),
    isGuest,
    chatType: message?.chat?.type,
    chatId: message?.chat?.id,
    messageId: message?.message_id,
    fromId: message?.from?.id,
    hasText: typeof message?.text === 'string',
    entityTypes: Array.isArray(message?.entities) ? message.entities.map(e => e.type) : null,
  })

  // First-look diagnostic for guest_message — the schema is new and we
  // want to confirm field names before relying on them. Verbose on
  // purpose; once verified this can be tightened or removed.
  if (isGuest) {
    console.info('[grp] guest_message shape', {
      topKeys: Object.keys(update.guest_message || {}),
      chatKeys: update.guest_message?.chat ? Object.keys(update.guest_message.chat) : null,
      fromKeys: update.guest_message?.from ? Object.keys(update.guest_message.from) : null,
      textPreview: typeof update.guest_message?.text === 'string'
        ? update.guest_message.text.slice(0, 120)
        : null,
    })
  }

  if (typeof message?.text !== 'string') return

  const chatType = message.chat?.type
  if (!isGuest && chatType === 'private') {
    return handleTextMessage(env, ctx, message).catch(err => {
      console.warn('message handler error', err)
      return sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: message.chat.id,
        text: 'Something went wrong on my end. Try again in a moment.',
      }).catch(() => {})
    })
  }

  if (isGuest || chatType === 'group' || chatType === 'supergroup') {
    const botUsername = await getBotUsername(env)
    const payload = extractMentionPayload(message, botUsername)
    // No mention of this bot → not for us. Stay quiet so we don't pollute
    // the group with replies to unrelated chatter.
    if (payload === null) return
    return handleTextMessage(env, ctx, message, {
      text: payload,
      isGroup: true,
      replyToMessageId: message.message_id,
    }).catch(err => {
      console.warn('group message handler error', err)
      return sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: message.chat.id,
        text: 'Something went wrong on my end. Try again in a moment.',
        reply_to_message_id: message.message_id,
      }).catch(() => {})
    })
  }
}
