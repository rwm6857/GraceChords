// POST /api/export/songbook
//   Body: {
//     items: [{ song_id: uuid, key?: string }]   (max 200),
//     title?: string,          // cover title
//     subtitle?: string,       // cover subtitle (e.g. a date)
//     include_toc?: boolean,   // default true; also numbers song titles
//     cover_image?: string     // optional data: URL used as the cover page
//   }
//   Headers: Authorization: Bearer <supabase access token>
//
// Renders a songbook — a cover page, an optional numbered table of contents,
// then every song (one per page) in alphabetical order — to a single PDF using
// the same DOM-free pdf_mvp engine the browser songbook and the setlist export
// use. Returns application/pdf bytes. This is the multi-song counterpart to
// /api/export/setlist with cover + TOC front matter; songs render in their
// default (or requested) key.
//
// Fonts: registers Noto from R2 (makeFontRegistrar) so output matches the
// browser + Telegram bot, falling back to Helvetica/Courier if R2 is absent.

import { renderSongbookPdfBuffer } from '../../../src/utils/pdf_mvp/pure.js'
import { toRenderableSong } from '../../../src/utils/pdf_mvp/serverSong.js'
import { makeFontRegistrar } from '../../../src/utils/pdf_mvp/fontsR2.js'
import {
  UUID_RE,
  corsPreflight,
  ensureWindowShim,
  fetchSongsByFilter,
  jsonError,
  verifySupabaseJwt,
} from './_shared.js'

ensureWindowShim()

const MAX_ITEMS = 200
// ~3 MB of base64 data covers a reasonably sized cover image without letting a
// runaway payload tie up the renderer.
const MAX_COVER_CHARS = 3 * 1024 * 1024

function sanitizeFilename(name) {
  const base = String(name || 'songbook').replace(/[\\/:*?"<>|]+/g, '_').trim()
  return base || 'songbook'
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') return corsPreflight(request)
  if (request.method !== 'POST') return jsonError('Method not allowed', 405)

  const auth = await verifySupabaseJwt(request, env)
  if (auth.error) return jsonError(auth.error, auth.status)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const items = Array.isArray(body?.items) ? body.items : null
  if (!items || items.length === 0) return jsonError('items required', 400)
  if (items.length > MAX_ITEMS) return jsonError(`Too many items (max ${MAX_ITEMS})`, 400)

  const normalized = []
  for (const it of items) {
    const songId = typeof it?.song_id === 'string' ? it.song_id.trim() : ''
    if (!UUID_RE.test(songId)) return jsonError('each item.song_id must be a UUID', 400)
    const key = typeof it?.key === 'string' ? it.key.trim() : ''
    normalized.push({ song_id: songId, key })
  }

  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Songbook'
  const subtitle = typeof body?.subtitle === 'string' ? body.subtitle.trim() : ''
  const includeTOC = body?.include_toc !== false

  let coverImageDataUrl = null
  if (body?.cover_image != null) {
    if (typeof body.cover_image !== 'string' || !body.cover_image.startsWith('data:image/')) {
      return jsonError('cover_image must be a data:image/ URL', 400)
    }
    if (body.cover_image.length > MAX_COVER_CHARS) {
      return jsonError('cover_image too large', 413)
    }
    coverImageDataUrl = body.cover_image
  }

  // One query for all unique ids, then map back (dropping any id the query
  // didn't return, e.g. soft-deleted since). The renderer sorts alphabetically.
  const uniqueIds = [...new Set(normalized.map((n) => n.song_id))]
  const inList = uniqueIds.map((id) => encodeURIComponent(id)).join(',')
  const found = await fetchSongsByFilter(env, `id=in.(${inList})`)
  if (found.error) return jsonError(found.error, found.status)
  const rowById = new Map(found.rows.map((r) => [r.id, r]))

  const renderables = []
  for (const n of normalized) {
    const row = rowById.get(n.song_id)
    if (row) renderables.push(toRenderableSong(row, n.key))
  }
  if (renderables.length === 0) return jsonError('No songs found', 404)

  let pdf
  try {
    pdf = await renderSongbookPdfBuffer(renderables, {
      includeTOC,
      coverImageDataUrl,
      title,
      subtitle,
      registerFonts: makeFontRegistrar(env),
    })
  } catch (err) {
    return jsonError(`Render failed: ${err?.message || err}`, 500)
  }

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(title)}.pdf"`,
    },
  })
}
