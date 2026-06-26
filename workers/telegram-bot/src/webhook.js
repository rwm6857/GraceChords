// Telegram webhook handler — routes DM messages, group/guest-chat @mentions,
// and inline-button callback queries. Channel posts and edited messages are
// silently ignored.

import { findUserByTelegramId } from './supabase.js'
import { checkRateLimit, formatCooldown } from './ratelimit.js'
import { checkGroupRateLimit } from './groupRateLimit.js'
import { parseRequest } from './parseRequest.js'
import { fetchSong, fetchSetlistSongs } from './searchClient.js'
import { stagePhoto, stageDocument } from './mediaCache.js'
import {
  saveResolution,
  loadResolution,
  clearResolution,
  parseSelectionNumber,
  advanceResolution,
  applyChoice,
  toCandidate,
} from './resolver.js'
import {
  sendMessage,
  sendPhoto,
  sendDocument,
  sendChatAction,
  answerCallbackQuery,
  answerGuestQuery,
  deleteMessage,
  getMe,
} from './telegram.js'
import { renderSongPdf, renderSetlistPdf, renderSongJpg } from './pdfRender.js'
import {
  sendSongJpgOrPdf,
  sendSetlistResponse,
} from './sendChart.js'

// Bot username is needed to detect @mentions in group chats. Cache once
// per isolate — getMe() is a single Telegram round-trip and the username
// only changes if the maintainer renames the bot via BotFather.
let cachedBotUsername = null
async function getBotUsername(env) {
  if (cachedBotUsername) return cachedBotUsername
  try {
    const me = await getMe(env.TELEGRAM_BOT_TOKEN)
    cachedBotUsername = (me?.username || '').toLowerCase()
  } catch (err) {
    console.warn('getMe failed', err?.message || err)
    cachedBotUsername = ''
  }
  return cachedBotUsername
}

// Pulls out the @bot mention (if any) and returns the remaining text. Only
// returns non-null when this message is actually directed at the bot.
function extractMentionPayload(message, botUsername) {
  if (!botUsername) return null
  const text = String(message?.text || '')
  const entities = Array.isArray(message?.entities) ? message.entities : []
  const want = `@${botUsername}`.toLowerCase()
  for (const ent of entities) {
    if (ent.type !== 'mention') continue
    const slice = text.slice(ent.offset, ent.offset + ent.length).toLowerCase()
    if (slice !== want) continue
    const before = text.slice(0, ent.offset)
    const after = text.slice(ent.offset + ent.length)
    return (before + ' ' + after).replace(/\s+/g, ' ').trim()
  }
  return null
}

const USER_CACHE_TTL_S = 5 * 60

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

function startText(name) {
  const greeting = name ? `Hi ${name}!` : 'Hi!'
  return [
    `${greeting} You can send me a song (or comma-separated list of songs) to get chord sheets. To transpose, simply include the desired key!`,
    '',
    'Use /help for more details — enjoy!',
  ].join('\n')
}

function helpText() {
  return [
    'Quick guide:',
    '',
    '• Song title → chord chart, e.g. "Build My Life"',
    '• Add a key to transpose → "Build My Life in G"',
    '• Setlist → comma-separated, e.g. "Build My Life in G, 10000 Reasons in A"',
    '• Each chart comes as a JPG. Tap "Get as PDF" on any chart to download the PDF version instead.',
    '',
    'In a group chat, mention me first: "@gracechords_bot Build My Life in G".',
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

async function loadSetlistToken(env, token) {
  if (!env.BOT_KV) return null
  return env.BOT_KV.get(`setlist:${token}`, 'json')
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
  const startMatch = /^\/start\b/i.test(text)
  const helpMatch = /^\/help\b/i.test(text)
  if (startMatch || helpMatch) {
    if (isGroup) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: 'Mention me with a song title (e.g. "@gracechords_bot Build My Life in G") and I\'ll drop the chord chart in the chat.',
        reply_to_message_id: replyToMessageId,
      })
      return
    }
    const user = await getLinkedUser(env, telegramUserId)
    if (!user) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, { chat_id: chatId, text: onboardingText() })
      return
    }
    const name = (user.display_name || '').trim()
    const body = helpMatch ? helpText() : startText(name)
    await sendMessage(env.TELEGRAM_BOT_TOKEN, { chat_id: chatId, text: body })
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

  // A fresh request supersedes any half-finished disambiguation.
  const scope = chatScope({ isGroup, chatId, userId: telegramUserId })
  await clearResolution(env, scope)

  const surface = isGroup ? 'group' : 'dm'
  const picks = []
  const step = await advanceResolution(env, items, picks)
  await continueChatResolution({
    env, scope, surface, chatId, replyToMessageId, items, picks, step,
  })
}

// KV scope key for a chat's in-flight resolution. Per-user inside a group so
// two people disambiguating at once don't clobber each other.
function chatScope({ isGroup, chatId, userId }) {
  return isGroup ? `grp:${chatId}:${userId}` : `dm:${userId}`
}

// Drive a DM/group resolution to its next stop: ask about an ambiguous title
// (inline buttons), report a miss, or deliver the finished song/setlist.
async function continueChatResolution({ env, scope, surface, chatId, replyToMessageId, items, picks, step }) {
  if (step.status === 'none') {
    await clearResolution(env, scope)
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: `I couldn't find "${step.item.title}". Try a different spelling?`,
      reply_to_message_id: replyToMessageId,
    })
    return
  }

  if (step.status === 'choose') {
    const candidates = step.candidates.slice(0, 4)
    const keyboard = candidates.map(c => ([{
      text: `${c.title}${c.artist ? ` — ${c.artist}` : ''}`,
      callback_data: `rpick:${c.id}`,
    }]))
    const prefix = items.length > 1 ? `Song ${step.index + 1}: ` : ''
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: chatId,
      text: `${prefix}Which "${step.item.title}" did you mean?`,
      reply_markup: { inline_keyboard: keyboard },
      reply_to_message_id: replyToMessageId,
    })
    await saveResolution(env, scope, {
      surface, chatId, replyToMessageId, items, picks,
      candidates: candidates.map(toCandidate),
    })
    return
  }

  await clearResolution(env, scope)
  await deliverChatResolved({ env, chatId, replyToMessageId, picks })
}

async function deliverChatResolved({ env, chatId, replyToMessageId, picks }) {
  if (picks.length === 1) {
    const song = await fetchSong(env, picks[0].id)
    await sendSongJpgOrPdf({ env, chatId, song, key: picks[0].key, replyToMessageId })
    return
  }
  const songs = await fetchSetlistSongs(env, picks.map(p => ({ song_id: p.id, key: p.key })))
  const keys = picks.map(p => p.key)
  await sendSetlistResponse({ env, chatId, songs, keys, replyToMessageId })
}

// Build the public song URL used in text fallbacks. Mirrors the format
// the digest builder uses so users see a familiar gracechords.com link.
function songPageUrl(song, key) {
  const slug = song?.slug || song?.id
  if (!slug) return null
  const base = `https://www.gracechords.com/song/${encodeURIComponent(slug)}`
  return key ? `${base}?key=${encodeURIComponent(key)}` : base
}

// Deliver a single resolved song over a guest query. Tries the photo shape
// first (render JPG → stage to capture a file_id → cached-photo reply → delete
// the staging message), and falls back to a text reply with a deep link on any
// failure. Shared by the direct-match path and the numbered-selection path.
async function sendGuestSong(env, ctx, { guestQueryId, song, key }) {
  const caption = `${song.title}${key ? ` — ${key}` : ''}`
  const replyText = (text) => answerGuestQuery(env.TELEGRAM_BOT_TOKEN, { guestQueryId, text })
    .catch(err => {
      console.warn('answerGuestQuery text failed', err?.message || err)
    })

  const jpg = await renderSongJpg(env, song, key).catch(err => {
    console.warn('renderSongJpg failed', err?.message || err)
    return null
  })

  if (jpg) {
    try {
      const staged = await stagePhoto(env, {
        jpg,
        filename: `${(song.slug || song.id || 'song')}.png`,
        caption,
      })
      await answerGuestQuery(env.TELEGRAM_BOT_TOKEN, {
        guestQueryId,
        photoFileId: staged.fileId,
        caption,
      })
      // Best-effort cleanup. Telegram keeps the file backing the file_id
      // alive after the message is deleted, so the reply we just sent
      // continues to work for the recipient.
      ctx.waitUntil(
        deleteMessage(env.TELEGRAM_BOT_TOKEN, {
          chatId: staged.chatId,
          messageId: staged.messageId,
        }).catch(err => {
          console.warn('staging deleteMessage failed', err?.message || err)
        })
      )
      return
    } catch (err) {
      console.warn('guest photo reply failed, falling back to text', err?.message || err)
    }
  }

  const url = songPageUrl(song, key)
  const text = url
    ? `${caption}\nOpen the chart: ${url}`
    : `${caption}\nDM me for the chord chart: https://t.me/gracechords_bot`
  await replyText(text)
}

// Deliver a multi-song setlist over a guest query. Guest mode allows a single
// message and no inline buttons, so the whole set ships as one combined PDF
// (cached document). Falls back to a text list of per-song links if rendering
// or staging fails — same spirit as the single-song text fallback.
async function sendGuestSetlist(env, ctx, { guestQueryId, picks }) {
  const replyText = (text) => answerGuestQuery(env.TELEGRAM_BOT_TOKEN, { guestQueryId, text })
    .catch(err => {
      console.warn('answerGuestQuery text failed', err?.message || err)
    })

  const songs = await fetchSetlistSongs(env, picks.map(p => ({ song_id: p.id, key: p.key })))
    .catch(err => {
      console.warn('fetchSetlistSongs failed', err?.message || err)
      return []
    })
  if (!songs.length) {
    return replyText('Something went wrong building that setlist. Try again in a moment.')
  }
  const keys = picks.map(p => p.key)

  const pdf = await renderSetlistPdf(env, songs, keys).catch(err => {
    console.warn('renderSetlistPdf failed', err?.message || err)
    return null
  })
  if (pdf) {
    try {
      const staged = await stageDocument(env, { pdf, filename: 'setlist.pdf', caption: 'Setlist' })
      await answerGuestQuery(env.TELEGRAM_BOT_TOKEN, {
        guestQueryId,
        documentFileId: staged.fileId,
        caption: 'Setlist',
        title: 'Setlist (PDF)',
      })
      ctx.waitUntil(
        deleteMessage(env.TELEGRAM_BOT_TOKEN, {
          chatId: staged.chatId,
          messageId: staged.messageId,
        }).catch(err => {
          console.warn('staging deleteMessage failed', err?.message || err)
        })
      )
      return
    } catch (err) {
      console.warn('guest setlist document failed, falling back to text', err?.message || err)
    }
  }

  const lines = songs.map((s, i) => {
    const url = songPageUrl(s, keys[i])
    const head = `${i + 1}. ${s.title}${keys[i] ? ` — ${keys[i]}` : ''}`
    return url ? `${head}\n${url}` : head
  })
  await replyText(`Here's your setlist:\n${lines.join('\n')}`)
}

// Drive a guest resolution to its next stop: ask about an ambiguous title
// (numbered text — guest mode has no buttons), report a miss, or deliver the
// finished song/setlist.
async function continueGuestResolution({ env, ctx, guestQueryId, scope, state, step, botUsername }) {
  const replyText = (text) => answerGuestQuery(env.TELEGRAM_BOT_TOKEN, { guestQueryId, text })
    .catch(err => {
      console.warn('answerGuestQuery text failed', err?.message || err)
    })

  if (step.status === 'none') {
    if (scope) await clearResolution(env, scope)
    return replyText(`I couldn't find "${step.item.title}". Try a different spelling?`)
  }

  if (step.status === 'choose') {
    const candidates = step.candidates.slice(0, 3)
    const list = candidates
      .map((c, i) => `${i + 1}. ${c.title}${c.artist ? ` — ${c.artist}` : ''}`)
      .join('\n')
    state.candidates = candidates.map(toCandidate)
    if (scope) await saveResolution(env, scope, state)
    const mention = botUsername ? `@${botUsername}` : '@gracechords_bot'
    const prefix = state.items.length > 1 ? `Song ${step.index + 1}: ` : ''
    return replyText(
      `${prefix}Multiple matches for "${step.item.title}":\n${list}\n\nReply with the number you want — like "${mention} 2".`
    )
  }

  if (scope) await clearResolution(env, scope)
  if (state.picks.length === 1) {
    const song = await fetchSong(env, state.picks[0].id)
    return sendGuestSong(env, ctx, { guestQueryId, song, key: state.picks[0].key })
  }
  return sendGuestSetlist(env, ctx, { guestQueryId, picks: state.picks })
}

// Dedicated guest-message flow. Kept separate from handleTextMessage on
// purpose: guest replies go through answerGuestQuery, not sendPhoto, and
// the accepted parameter set for that method is still empirical. Disambiguation
// uses a numbered text list (no inline buttons in guest mode); the caller picks
// by replying "@bot <n>" — Guest Chat Mode only delivers messages that mention
// the bot, so a bare number never reaches us. The resolution state machine
// (resolver.js) lets a pick resume a half-built setlist instead of dropping it.
async function handleGuestMessage(env, ctx, message) {
  const guestQueryId = message?.guest_query_id
  if (!guestQueryId) {
    console.warn('guest_message missing guest_query_id', { keys: Object.keys(message || {}) })
    return
  }

  const replyText = (text) => answerGuestQuery(env.TELEGRAM_BOT_TOKEN, { guestQueryId, text })
    .catch(err => {
      console.warn('answerGuestQuery text failed', err?.message || err)
    })

  const botUsername = await getBotUsername(env)
  const payload = extractMentionPayload(message, botUsername)
  if (payload === null) return

  if (/^\/(start|help)\b/i.test(payload)) {
    return replyText('Mention me with a song title (e.g. "@gracechords_bot Build My Life in G") and I\'ll send the chord chart.')
  }

  const callerId = message.from?.id ?? message.guest_bot_caller_user?.id
  const scope = callerId ? `guest:${callerId}` : null

  // A number after we offered a numbered list resumes that disambiguation.
  // If there's no pending list, fall through and treat the number as a search.
  const selection = parseSelectionNumber(payload)
  if (selection != null && scope) {
    const state = await loadResolution(env, scope)
    if (state) {
      const candidates = state.candidates || []
      if (selection > candidates.length) {
        return replyText(`Please reply with a number between 1 and ${candidates.length}.`)
      }
      applyChoice(state, candidates[selection - 1])
      const step = await advanceResolution(env, state.items, state.picks)
      return continueGuestResolution({ env, ctx, guestQueryId, scope, state, step, botUsername })
    }
  }

  const items = parseRequest(payload)
  if (items.length === 0) {
    return replyText('I couldn\'t read that. Try a title like "Build My Life in G".')
  }

  // Fresh request supersedes any half-finished disambiguation.
  if (scope) await clearResolution(env, scope)
  const state = { surface: 'guest', items, picks: [], candidates: [] }
  const step = await advanceResolution(env, items, state.picks)
  return continueGuestResolution({ env, ctx, guestQueryId, scope, state, step, botUsername })
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

  // Resolution pick: record the chosen song and resume building the request.
  // If the rest of the setlist resolves cleanly, the WHOLE set is delivered —
  // not just this one song.
  if (data.startsWith('rpick:')) {
    const songId = data.slice('rpick:'.length)
    const userId = cbq.from?.id
    const isGroup = cbq.message?.chat?.type !== 'private'
    const scope = chatScope({ isGroup, chatId, userId })
    const state = await loadResolution(env, scope)
    if (!state) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: chatId,
        text: 'That menu expired — send the song (or setlist) again.',
      })
      return
    }
    const candidate = (state.candidates || []).find(c => String(c.id) === String(songId))
    if (!candidate) return
    applyChoice(state, candidate)
    const step = await advanceResolution(env, state.items, state.picks)
    await continueChatResolution({
      env, scope, surface: state.surface, chatId,
      replyToMessageId: state.replyToMessageId,
      items: state.items, picks: state.picks, step,
    })
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
  // Guest deliveries take a completely separate handler because the reply
  // channel (answerGuestQuery + guest_query_id) is incompatible with the
  // chat-id-based sendPhoto/sendMessage path the regular flows use.
  const message = update?.message ?? update?.guest_message
  const isGuest = !update?.message && !!update?.guest_message

  if (typeof message?.text !== 'string') return

  if (isGuest) {
    return handleGuestMessage(env, ctx, message).catch(err => {
      console.warn('guest handler error', err?.message || err)
    })
  }

  const chatType = message.chat?.type
  if (chatType === 'private') {
    return handleTextMessage(env, ctx, message).catch(err => {
      console.warn('message handler error', err)
      return sendMessage(env.TELEGRAM_BOT_TOKEN, {
        chat_id: message.chat.id,
        text: 'Something went wrong on my end. Try again in a moment.',
      }).catch(() => {})
    })
  }

  if (chatType === 'group' || chatType === 'supergroup') {
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
