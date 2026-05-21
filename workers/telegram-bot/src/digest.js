// Mon/Fri 17:00 ET digest. Lists new songs and posts since the last digest
// run. Skipped if both lists are empty (no empty digests).

import { listSongsSince, listPostsSince } from './supabase.js'
import { sendMessage } from './telegram.js'

const LAST_KEY = 'state:last_digest_at'
const DEFAULT_LOOKBACK_DAYS = 4

function formatDate(d) {
  const opts = { weekday: 'short', month: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat('en-US', opts).format(d)
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildMessage({ now, songs, posts }) {
  const lines = [`🎸 <b>GraceChords digest — ${escapeHtml(formatDate(now))}</b>`, '']

  if (songs.length) {
    lines.push('🎵 <b>New songs:</b>')
    for (const s of songs) {
      const title = escapeHtml(s.title || 'Untitled')
      const url = s.slug ? `https://www.gracechords.com/song/${encodeURIComponent(s.slug)}` : null
      lines.push(url ? `• <a href="${url}">${title}</a>` : `• ${title}`)
    }
    lines.push('')
  }

  if (posts.length) {
    lines.push('📝 <b>New posts:</b>')
    for (const p of posts) {
      const title = escapeHtml(p.title || 'Untitled')
      const url = p.slug ? `https://www.gracechords.com/blog/${encodeURIComponent(p.slug)}` : null
      lines.push(url ? `• <a href="${url}">${title}</a>` : `• ${title}`)
    }
  }

  return lines.join('\n').trim()
}

export async function runDigest(env) {
  if (!env.DEV_CHANNEL_ID || !env.TELEGRAM_BOT_TOKEN) {
    console.warn('Digest skipped: TELEGRAM_BOT_TOKEN or DEV_CHANNEL_ID not set')
    return { sent: false, reason: 'unconfigured' }
  }

  const now = new Date()
  let sinceIso = await env.BOT_KV?.get(LAST_KEY)
  if (!sinceIso) {
    sinceIso = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  }

  const [songs, postsRaw] = await Promise.all([
    listSongsSince(env, sinceIso).catch(() => []),
    listPostsSince(env, sinceIso).catch(() => []),
  ])
  const posts = (Array.isArray(postsRaw) ? postsRaw : []).filter(p => {
    const ts = p.published_at || p.created_at
    return ts && ts > sinceIso
  })

  if (songs.length === 0 && posts.length === 0) {
    return { sent: false, reason: 'empty' }
  }

  const text = buildMessage({ now, songs, posts })
  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: env.DEV_CHANNEL_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })

  if (env.BOT_KV) {
    await env.BOT_KV.put(LAST_KEY, now.toISOString())
  }

  return { sent: true, songs: songs.length, posts: posts.length }
}
