import { File, Paths } from 'expo-file-system'
import { supabase } from './supabase'

// Server-side song export. Calls the web app's Pages Function
// POST /api/export/song, which renders with the same pure pdf_mvp engine the
// web app uses and returns the bytes (PDF, or a PNG raster of page 1 for
// 'jpg' — the server has no JPG encoder, and share sheets don't care).
// The bytes are written to the app cache and the local URI returned for
// expo-sharing / the system share sheet.

export type ExportFormat = 'pdf' | 'jpg'

const base = process.env.EXPO_PUBLIC_API_BASE_URL

function apiBase(): string {
  if (!base) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_BASE_URL. ' +
        'Copy apps/mobile/.env.example to apps/mobile/.env and fill in the values.',
    )
  }
  return base.replace(/\/$/, '')
}

export async function exportSong(opts: {
  songId: string
  key?: string
  format?: ExportFormat
}): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session) throw new Error('not_signed_in')

  const format = opts.format ?? 'pdf'
  const res = await fetch(`${apiBase()}/api/export/song`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ song_id: opts.songId, key: opts.key || '', format }),
  })

  // 501 = server rasteriser unavailable; caller should offer PDF instead.
  if (res.status === 501) throw new Error('image_unavailable')
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `export_failed_${res.status}`)
  }

  const contentType = res.headers.get('content-type') || ''
  const ext = contentType.includes('pdf') ? 'pdf' : 'png'
  const disposition = res.headers.get('content-disposition') || ''
  const nameMatch = disposition.match(/filename="([^"]+)"/)
  const filename = nameMatch?.[1] || `song-export.${ext}`

  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.write(new Uint8Array(await res.arrayBuffer()))
  return file.uri
}
