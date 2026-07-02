// POST /api/export/song
//   Body: { song_id?: uuid, slug?: string, key?: string, format?: 'pdf' | 'jpg' | 'png' }
//   Headers: Authorization: Bearer <supabase access token>
//
// Renders a single song server-side with the same pure pdf_mvp engine the
// web app and the Telegram bot use, and returns the bytes — PDF always,
// or a PNG raster of page 1 for format 'jpg'/'png' ('jpg' is accepted as an
// alias; the rasteriser encodes PNG and share sheets don't care). If the
// pdfium WASM isn't available the image formats respond 501
// { error: 'image_unavailable' } so clients can fall back to PDF.
//
// Fonts: no registerFonts is passed, so the engine falls back to jsPDF's
// built-in Helvetica/Courier (same trade-off as the Telegram worker —
// legible, not glyph-identical to the browser's Noto output).

import { renderSingleSongPdfBuffer } from '../../../src/utils/pdf_mvp/pure.js'
import { toRenderableSong } from '../../../src/utils/pdf_mvp/serverSong.js'
import { rasterizePdfToPng } from '../../../src/utils/pdf_mvp/pngRaster.js'
import { makeFontRegistrar } from '../../../src/utils/pdf_mvp/fontsR2.js'
// Bundle the pdfium WASM at deploy time. Workers/Pages only allow
// pre-compiled WebAssembly.Module instances, which is what wrangler's
// bundler produces from a .wasm import.
import pdfiumWasmModule from '@hyzyla/pdfium/pdfium.wasm'

// jsPDF references `window` in a couple of optional code paths. Provide a
// minimal shim before any pdf_mvp call. Safe in browsers (already exists).
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis
}

function json(body, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }
  return new Response(JSON.stringify(body), { ...init, headers })
}
function jsonError(msg, status, extra) {
  return json({ error: msg, ...(extra || {}) }, { status })
}

async function verifySupabaseJwt(request, env) {
  const auth = request.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) {
    return { error: 'Missing bearer token', status: 401 }
  }
  const token = auth.slice(7).trim()

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  if (resp.status === 401) return { error: 'Invalid or expired token', status: 401 }
  if (!resp.ok) return { error: `Auth check failed: ${resp.status}`, status: 502 }
  const user = await resp.json().catch(() => null)
  if (!user?.id) return { error: 'Auth response missing user id', status: 502 }
  return { userId: user.id }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchSongRow(env, { song_id, slug }) {
  const filter = song_id
    ? `id=eq.${encodeURIComponent(song_id)}`
    : `slug=eq.${encodeURIComponent(slug)}`
  const select = 'id,slug,title,artist,default_key,chordpro_content'
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/songs?select=${select}&${filter}&is_deleted=eq.false&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  if (!resp.ok) return { error: `Supabase query failed: ${resp.status}`, status: 502 }
  const rows = await resp.json().catch(() => null)
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'Song not found', status: 404 }
  return { song: rows[0] }
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': new URL(request.url).origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (request.method !== 'POST') {
    return jsonError('Method not allowed', 405)
  }

  const auth = await verifySupabaseJwt(request, env)
  if (auth.error) return jsonError(auth.error, auth.status)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const songId = typeof body?.song_id === 'string' ? body.song_id.trim() : ''
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : ''
  if (songId && !UUID_RE.test(songId)) return jsonError('song_id must be a UUID', 400)
  if (!songId && !slug) return jsonError('song_id or slug required', 400)

  const format = body?.format ? String(body.format).toLowerCase() : 'pdf'
  if (!['pdf', 'jpg', 'png'].includes(format)) {
    return jsonError('format must be pdf, jpg or png', 400)
  }
  const key = typeof body?.key === 'string' ? body.key.trim() : ''

  const found = await fetchSongRow(env, { song_id: songId, slug })
  if (found.error) return jsonError(found.error, found.status)

  let pdf
  try {
    const renderable = toRenderableSong(found.song, key)
    // Register Noto from R2 so output matches the browser + Telegram bot; the
    // registrar falls back to Helvetica/Courier if the R2 binding is absent.
    pdf = await renderSingleSongPdfBuffer(renderable, { registerFonts: makeFontRegistrar(env) })
  } catch (err) {
    return jsonError(`Render failed: ${err?.message || err}`, 500)
  }

  const base = `${found.song.slug || found.song.id}${key ? `-${key}` : ''}`

  if (format === 'pdf') {
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
      },
    })
  }

  const png = await rasterizePdfToPng(pdf, pdfiumWasmModule, { scale: 2 })
  if (!png) return jsonError('image_unavailable', 501)
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${base}.png"`,
    },
  })
}
