// Admin alert for a reported public reflection. Called by the Pages Function
// POST /api/reflections/report via /internal/report-alert. Sends an HTML message
// to the DEV_CHANNEL_ID admin channel with everything needed to act in the
// Supabase dashboard in two edits: (1) set removed_at/removed_reason on the post,
// (2) insert a banned_users row for the author. Mirrors digest.js.

import { sendMessage } from './telegram.js'

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildMessage({ reflection_id, author_id, reflection_date, reason, preview }) {
  const lines = [
    '🚩 <b>Reflection reported</b>',
    '',
    `<b>reflection_id:</b> <code>${escapeHtml(reflection_id)}</code>`,
    `<b>author user_id:</b> <code>${escapeHtml(author_id || 'unknown')}</code>`,
    `<b>reflection_date:</b> ${escapeHtml(reflection_date || 'unknown')}`,
    `<b>reason:</b> ${escapeHtml(reason || '—')}`,
    '',
    '<b>Preview:</b>',
    `<blockquote>${escapeHtml(preview || '(empty)')}</blockquote>`,
    '',
    'Act in Supabase → <code>reflections</code>: set <code>removed_at</code> + <code>removed_reason</code> to hide.',
    'To eject the author, insert a <code>banned_users</code> row for the user_id above.',
  ]
  return lines.join('\n')
}

// Send the alert. Throws on a Telegram send failure so the caller can report it.
export async function sendReportAlert(env, payload) {
  if (!env.DEV_CHANNEL_ID || !env.TELEGRAM_BOT_TOKEN) {
    console.warn('Report alert skipped: TELEGRAM_BOT_TOKEN or DEV_CHANNEL_ID not set')
    return { sent: false, reason: 'unconfigured' }
  }
  await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: env.DEV_CHANNEL_ID,
    text: buildMessage(payload || {}),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
  return { sent: true }
}
